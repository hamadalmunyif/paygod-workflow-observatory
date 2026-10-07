#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { sha256Bytes } from "../src/digest.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { verifyControlledReleaseCandidateV0 } from "../src/controlled-release-candidate-v0.mjs";
import { parseExactTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";
import { verifyWarrantV0 } from "../src/warrant-v0.mjs";
import { trustedWarrantIssuersFromExternalTrustV0 } from "../src/warrant-issuer-trust-v0.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error("Missing required argument: " + name);
  return value;
}
async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}
function fail(message) {
  throw new Error(message);
}
function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function requireAddress(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    fail(label + " must be an EVM address");
  }
  return value.toLowerCase();
}
function requireHex32(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    fail(label + " must be 32-byte 0x hex");
  }
  return value.toLowerCase();
}
function topicAddress(topic, label) {
  const value = requireHex32(topic, label);
  if (!/^0x0{24}[0-9a-f]{40}$/.test(value)) {
    fail(label + " is not a canonically padded indexed address");
  }
  return "0x" + value.slice(-40);
}
function topicUint(topic, label) {
  const value = BigInt(requireHex32(topic, label));
  if (value <= 0n) fail(label + " must be positive");
  return value.toString(10);
}
function receiptSucceeded(status) {
  return status === "0x1" || status === "0x01" || status === 1 || status === "1";
}
function run(cmd, args, label) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) fail(label + " could not start: " + r.error.message);
  if (r.status !== 0) {
    fail(label + " failed: " + (r.stderr || r.stdout || "").trim());
  }
  return r.stdout.trim();
}
async function rpcCall(url, method, params = []) {
  if (url !== "http://127.0.0.1:18545") {
    fail("post-flight v0 permits only the frozen local Anvil RPC");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) fail("RPC HTTP failure for " + method);
  const body = await response.json();
  if (body.error) fail("RPC error for " + method + ": " + JSON.stringify(body.error));
  return body.result;
}
async function copyExact(source, destination) {
  const bytes = await fs.readFile(source);
  await fs.writeFile(destination, bytes);
  return {
    name: path.basename(destination),
    sha256: sha256Bytes(bytes),
    bytes: bytes.length,
  };
}
async function verifyGateEvidence(result, releaseRoot) {
  if (
    result?.schema !== "workflow-observatory/gate-zero-t0-witness/v0" ||
    !Array.isArray(result.attempts) ||
    result.attempts.length === 0
  ) {
    fail("unexpected Gate Zero T0 result schema");
  }
  const checks = [];
  for (const attempt of result.attempts) {
    const evidencePath = attempt?.evidence_artifact_path;
    const expected = attempt?.evidence_sha256;
    if (
      typeof evidencePath !== "string" ||
      !evidencePath.startsWith("out/release/") ||
      !/^[a-f0-9]{64}$/.test(expected ?? "")
    ) {
      fail("invalid Gate Zero evidence reference");
    }
    const relative = evidencePath.slice("out/release/".length);
    const absolute = path.resolve(releaseRoot, relative);
    if (absolute !== releaseRoot && !absolute.startsWith(releaseRoot + path.sep)) {
      fail("Gate Zero evidence path escapes release root");
    }
    const actual = sha256Bytes(await fs.readFile(absolute));
    if (actual !== expected) {
      fail("Gate Zero evidence digest mismatch for " + attempt.attempt_id);
    }
    checks.push({ attempt_id: attempt.attempt_id, evidence_sha256: actual });
  }
  return checks;
}

const mode = requiredArg("--mode");
if (!["candidate", "main"].includes(mode)) {
  fail("--mode must be candidate or main");
}

const outputDir = requiredArg("--output-dir");
const bundleDir = path.join(outputDir, "bundle");
await fs.mkdir(bundleDir, { recursive: true });

const paths = {
  requestIdentity: requiredArg("--request-identity"),
  requestShadow: requiredArg("--request-shadow"),
  transition: requiredArg("--transition-envelope"),
  candidate: requiredArg("--candidate"),
  releaseProfile: requiredArg("--release-profile"),
  paygodBundle: requiredArg("--paygod-bundle"),
  decisionTrust: requiredArg("--decision-trust-store"),
  warrantBody: requiredArg("--warrant-body"),
  warrantSig: requiredArg("--warrant-signature"),
  warrantTrust: requiredArg("--warrant-trust-store"),
  issuanceAudit: requiredArg("--issuance-audit"),
  stateDb: requiredArg("--state-db"),
  e2Stage: requiredArg("--e2-stage"),
  stagedPayload: requiredArg("--staged-payload"),
  proposal: requiredArg("--transaction-proposal"),
  e1Execution: requiredArg("--e1-execution"),
  txEvidence: requiredArg("--tx-evidence"),
  transactionReceipt: requiredArg("--transaction-receipt"),
  instanceBinding: requiredArg("--instance-binding"),
  e2Release: requiredArg("--e2-release"),
  releasedPayload: requiredArg("--released-payload"),
  providerObservation: requiredArg("--provider-observation"),
  providerPayload: requiredArg("--provider-payload"),
  gateZeroResult: requiredArg("--gate-zero-result"),
};
const rpcUrl = requiredArg("--rpc-url");
const paygodVerifier =
  argValue("--paygod-verifier") ?? "external/paygod-kernel/tools/verify_portable_evidence.py";
const paygodCli = argValue("--paygod-cli") ?? "out/paygod-cli/PayGod.Cli.dll";
const castBin = argValue("--cast-bin") ?? "cast";
const pythonBin = argValue("--python") ?? "python3";
const releaseRoot = path.resolve(argValue("--release-root") ?? "out/release");

const verifierResultPath = path.join(outputDir, "paygod-independent-verification.json");
run(
  pythonBin,
  [
    paygodVerifier,
    paths.paygodBundle,
    "--trusted-issuer-keys",
    paths.decisionTrust,
    "--require-issuer-authenticity",
    "--result",
    verifierResultPath,
  ],
  "independent PayGod verifier"
);

const validateText = run(
  "dotnet",
  [paygodCli, "validate", "--input", paths.candidate, "--json"],
  "independent PayGod canonical validation"
);
let independentValidate;
try {
  independentValidate = JSON.parse(validateText);
} catch {
  fail("independent PayGod validate output is not JSON");
}

const [
  independentPaygod,
  receipt,
  requestIdentity,
  requestShadow,
  transitionBytes,
  candidateBytes,
  releaseProfile,
  warrantBodyBytes,
  warrantSignatureBytes,
  warrantTrustBytes,
  issuanceAudit,
  e2Stage,
  proposal,
  e1Execution,
  txEvidenceBytes,
  transactionReceipt,
  instanceBinding,
  e2Release,
  stagedPayload,
  releasedPayload,
  providerObservation,
  providerPayload,
  gateZeroResult,
] = await Promise.all([
  readJson(verifierResultPath),
  readJson(path.join(paths.paygodBundle, "receipt.json")),
  readJson(paths.requestIdentity),
  readJson(paths.requestShadow),
  fs.readFile(paths.transition),
  fs.readFile(paths.candidate),
  readJson(paths.releaseProfile),
  fs.readFile(paths.warrantBody),
  fs.readFile(paths.warrantSig),
  fs.readFile(paths.warrantTrust),
  readJson(paths.issuanceAudit),
  readJson(paths.e2Stage),
  readJson(paths.proposal),
  readJson(paths.e1Execution),
  fs.readFile(paths.txEvidence),
  readJson(paths.transactionReceipt),
  readJson(paths.instanceBinding),
  readJson(paths.e2Release),
  fs.readFile(paths.stagedPayload),
  fs.readFile(paths.releasedPayload),
  readJson(paths.providerObservation),
  fs.readFile(paths.providerPayload),
  readJson(paths.gateZeroResult),
]);

let txEvidence;
let warrantTrust;
try {
  txEvidence = JSON.parse(txEvidenceBytes.toString("utf8"));
  warrantTrust = JSON.parse(warrantTrustBytes.toString("utf8"));
} catch {
  fail("post-flight JSON evidence is malformed");
}

const checks = [];
function check(name, condition, detail) {
  if (!condition) fail(name + ": " + detail);
  checks.push({ name, ok: true, detail });
}

check(
  "PayGod integrity",
  independentPaygod.status === "valid" &&
    independentPaygod.verification?.integrity === "verified",
  "pinned standalone verifier independently verified the decision bundle"
);
check(
  "PayGod issuer authenticity",
  independentPaygod.verification?.issuer_authenticity === "verified" &&
    independentPaygod.issuer_signature?.key_trusted === true &&
    independentPaygod.issuer_signature?.signature_valid === true,
  "decision receipt signature verifies against external controlled trust"
);
check(
  "PayGod canonical input",
  independentValidate.status === "success" &&
    receipt.input?.canonical_hash === independentValidate.data?.hash,
  "receipt input hash matches an independent canonical validation of Release Candidate"
);
check(
  "PayGod release verdict",
  receipt.verdict?.value === releaseProfile.pack?.allowedVerdict &&
    receipt.verdict?.rule_name === releaseProfile.pack?.allowedRule &&
    receipt.pack?.digest_sha256 === releaseProfile.pack?.digestSha256,
  "authenticated receipt is the frozen controlled release ALLOW"
);

const candidate = verifyControlledReleaseCandidateV0({
  candidateBytes,
  requestShadow,
  transitionEnvelopeBytes: transitionBytes,
});
const transition = parseExactTransitionEnvelopeV0(transitionBytes);

check(
  "Request identity",
  requestIdentity.submittedRequestIdentitySha256 ===
      candidate.admittedRequestIdentitySha256 &&
    transition.envelope.request_identity_sha256 ===
      candidate.admittedRequestIdentitySha256,
  "frozen request identity equals Release Candidate and Transition Envelope"
);
check(
  "Request payload binding",
  requestIdentity.commitment?.requestPayloadArtifactSha256 ===
      transition.envelope.payload.payload_sha256 &&
    candidate.candidate.request?.request_payload_sha256 ===
      transition.envelope.payload.payload_sha256,
  "frozen request payload digest equals the committed payload surface"
);
check(
  "Local profile",
  releaseProfile.paygodKernelCommit ===
      "23ea2cca74ef8b698718c6d0c8dbda447f13bb37" &&
    releaseProfile.enforcementDomain === "controlled-harness/t0-v0" &&
    releaseProfile.chainId === 31337 &&
    releaseProfile.externalExecutionAuthorized === false,
  "controlled release remained inside frozen local-only profile"
);

const trustedWarrant = trustedWarrantIssuersFromExternalTrustV0({
  trustStore: warrantTrust,
  trustStoreBytes: warrantTrustBytes,
});

const store = await openAuthorityStateStoreV0(paths.stateDb);
let finalState;
try {
  const warrantBody = JSON.parse(warrantBodyBytes.toString("utf8"));
  const key = {
    issuerKeyId: warrantBody.issuer_key_id,
    nonce: warrantBody.nonce,
  };
  const preState = store.get(key);
  check(
    "Pre-conformance S0 state",
    preState?.state === "PAYLOAD_RELEASED",
    "V starts only from durable PAYLOAD_RELEASED"
  );

  const eventsBefore = store.listEvents(key);
  const expectedStatesBefore = [
    "ISSUED",
    "PAYLOAD_STAGED",
    "TX_RESERVED",
    "TX_EXECUTED",
    "PAYLOAD_RELEASED",
  ];
  check(
    "Authority event order",
    sameJson(eventsBefore.map((x) => x.newState), expectedStatesBefore) &&
      eventsBefore.every((x) => x.result === "SUCCESS"),
    "S0 event evidence is monotonic through PAYLOAD_RELEASED"
  );

  const releaseEvent = eventsBefore.at(-1);
  const verifiedWarrant = verifyWarrantV0({
    bodyBytes: warrantBodyBytes,
    signatureBytes: warrantSignatureBytes,
    trustedIssuers: trustedWarrant.trustedIssuers,
    expectedDomain: trustedWarrant.enforcementDomain,
    expectedTransitionCommitment: transition.transitionCommitment,
    nowMs: releaseEvent.eventTimestamp,
  });

  check(
    "Warrant",
    verifiedWarrant.status === "VALID" &&
      issuanceAudit.warrant_body_sha256 === verifiedWarrant.bodySha256 &&
      issuanceAudit.transition_commitment === transition.transitionCommitment &&
      issuanceAudit.nonce === verifiedWarrant.nonce &&
      issuanceAudit.warrant_issuer_key_id === verifiedWarrant.issuerKeyId,
    "signed Warrant and issuance audit bind the same transition and nonce"
  );
  check(
    "Decision-to-Warrant lineage",
    issuanceAudit.decision_status === "AUTHENTICATED_CANONICAL_ALLOW" &&
      issuanceAudit.decision_receipt_sha256 ===
        sha256Bytes(await fs.readFile(path.join(paths.paygodBundle, "receipt.json"))) &&
      issuanceAudit.release_candidate_sha256 === sha256Bytes(candidateBytes),
    "issuance audit binds the authenticated PayGod receipt and exact Release Candidate"
  );

  const stagedInDb = store.getStagedPayload(key);
  check(
    "Staged payload persistence",
    stagedInDb &&
      stagedInDb.payloadBytes.equals(stagedPayload) &&
      sha256Bytes(stagedPayload) === transition.envelope.payload.payload_sha256 &&
      e2Stage.payloadSha256 === transition.envelope.payload.payload_sha256,
    "S0 staged bytes and E2 stage evidence equal the committed payload"
  );
  check(
    "Exact E2 release",
    stagedPayload.equals(releasedPayload) &&
      stagedPayload.equals(providerPayload) &&
      sha256Bytes(releasedPayload) === e2Release.releasedPayloadSha256 &&
      e2Release.exactStagedBytesReleased === true &&
      e2Release.clientSuppliedReleasePayloadAccepted === false,
    "released and provider-received bytes are exactly the immutable staged bytes"
  );

  const txEvidenceSha256 = sha256Bytes(txEvidenceBytes);
  check(
    "E1 evidence binding",
    preState.txEvidenceSha256 === txEvidenceSha256 &&
      e1Execution.txEvidenceSha256 === txEvidenceSha256 &&
      txEvidence.transition_commitment === transition.transitionCommitment,
    "S0 and E1 summary bind the exact transaction-evidence bytes"
  );

  const txHash = requireHex32(txEvidence.transaction_hash, "transaction hash");
  const [chainIdHex, txLive, receiptLive] = await Promise.all([
    rpcCall(rpcUrl, "eth_chainId"),
    rpcCall(rpcUrl, "eth_getTransactionByHash", [txHash]),
    rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]),
  ]);
  if (!txLive || !receiptLive) fail("V could not independently read transaction/receipt");

  const committedTx = transition.envelope.transaction;
  const liveInput = String(txLive.input ?? "").toLowerCase();
  check(
    "Independent chain readback",
    Number.parseInt(chainIdHex, 16) === committedTx.chain_id &&
      requireAddress(txLive.from, "live tx sender") === committedTx.execution_account &&
      requireAddress(txLive.to, "live tx target") === committedTx.target &&
      sha256Bytes(Buffer.from(liveInput.slice(2), "hex")) === committedTx.calldata_sha256 &&
      BigInt(txLive.value) === BigInt(committedTx.native_value) &&
      requireHex32(receiptLive.transactionHash, "live receipt tx hash") === txHash &&
      receiptSucceeded(receiptLive.status),
    "V independently re-read the authorized successful transaction from local chain"
  );
  check(
    "Receipt artifact",
    requireHex32(transactionReceipt.transactionHash, "receipt artifact tx hash") === txHash &&
      receiptSucceeded(transactionReceipt.status),
    "preserved receipt artifact matches the authorized transaction"
  );

  const eventSignature =
    "JobCreated(uint256,address,address,address,uint256,bytes32,address)";
  const eventTopic = run(castBin, ["keccak", eventSignature], "JobCreated topic derivation").toLowerCase();
  const matchingLogs = (receiptLive.logs ?? []).filter((log) => {
    const topics = Array.isArray(log?.topics)
      ? log.topics.map((x) => String(x).toLowerCase())
      : [];
    return (
      String(log?.address ?? "").toLowerCase() === committedTx.target &&
      topics.length === 4 &&
      topics[0] === eventTopic
    );
  });
  check(
    "Receipt event cardinality",
    matchingLogs.length === 1,
    "exactly one JobCreated event belongs to the committed target"
  );

  const event = matchingLogs[0];
  const derivedJobId = topicUint(event.topics[1], "JobCreated job id");
  const eventClient = topicAddress(event.topics[2], "JobCreated client");
  const eventProvider = topicAddress(event.topics[3], "JobCreated provider");
  check(
    "Receipt-derived instance binding",
    eventClient === committedTx.execution_account &&
      eventProvider === transition.envelope.payload.recipient &&
      instanceBinding.classification === "INSTANCE_DERIVED_FROM_MATCHING_EXECUTION" &&
      instanceBinding.derived_job_id === derivedJobId &&
      instanceBinding.transaction_hash === txHash,
    "job instance is derived from the matching receipt event, not caller input"
  );

  check(
    "Provider observation",
    providerObservation.observation_class === "RUNTIME_OBSERVED" &&
      providerObservation.provider_identity === transition.envelope.payload.recipient &&
      providerObservation.transition_commitment === transition.transitionCommitment &&
      providerObservation.derived_job_id === derivedJobId &&
      providerObservation.transaction_hash === txHash &&
      providerObservation.payload_sha256 === sha256Bytes(providerPayload) &&
      providerObservation.payload_byte_length === providerPayload.length &&
      providerObservation.payload_content_type === transition.envelope.payload.content_type,
    "provider P observed the exact released payload in the derived job context"
  );
  check(
    "E2 release context",
    e2Release.s0State === "PAYLOAD_RELEASED" &&
      e2Release.transitionCommitment === transition.transitionCommitment &&
      e2Release.transactionHash === txHash &&
      e2Release.payloadRecipient === transition.envelope.payload.recipient &&
      e2Release.instanceBinding?.derived_job_id === derivedJobId &&
      e2Release.conformant === false,
    "E2 release stopped at PAYLOAD_RELEASED and did not self-certify conformance"
  );

  const gateChecks = await verifyGateEvidence(gateZeroResult, releaseRoot);
  check(
    "Gate Zero evidence",
    gateZeroResult.totals?.bypass_observed === 0 &&
      gateZeroResult.totals?.harness_defect === 0 &&
      gateZeroResult.totals?.rejected_as_expected === gateZeroResult.totals?.declared &&
      gateChecks.length === gateZeroResult.totals?.declared,
    "all frozen E1 T0 evidence digests re-verify with no observed bypass"
  );

  if (mode === "main") {
    check(
      "Main witness context",
      gateZeroResult.witness_status === "MAIN_PUSH_WITNESS" &&
        gateZeroResult.result === "NO_BYPASS_OBSERVED_UNDER_T0_E1_PRE_PROVIDER",
      "final conformance is emitted only on a main-push Gate Zero witness"
    );
  } else {
    check(
      "PR candidate context",
      gateZeroResult.witness_status === "PR_CANDIDATE_ONLY" &&
        gateZeroResult.result === "CANDIDATE_T0_WITNESS_PASSED_ON_PR",
      "PR verification remains candidate-only"
    );
  }

  const attackClassifications = [
    { attack: "A18", status: "RUNTIME_REJECTED", evidence: "C provider ingress unreachable" },
    { attack: "A19", status: "VERIFIER_GUARD_PRESENT_NOT_SEPARATELY_INJECTED", evidence: "provider/release mismatch prevents conformance" },
    { attack: "A20/A41", status: "RUNTIME_REJECTED", evidence: "pre-TX_EXECUTED release rejected" },
    { attack: "A26", status: "RUNTIME_REJECTED_SUPPORTING_T0", evidence: "exact staged-payload substitution/replacement attempts" },
    { attack: "A27", status: "VERIFIER_GUARD_PRESENT", evidence: "live tx must match transition and S0 tx evidence" },
    { attack: "A28", status: "NO_CALLER_JOB_ID_CARRIER", evidence: "job id derived only from receipt event" },
    { attack: "A37", status: "VERIFIER_GUARD_PRESENT", evidence: "event/provider observation must equal committed recipient" },
  ];

  let status;
  let claim;
  let conformantStateWritten = false;

  if (mode === "main") {
    const conformant = store.markConformant({
      issuerKeyId: verifiedWarrant.issuerKeyId,
      nonce: verifiedWarrant.nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: verifiedWarrant.enforcementDomain,
    });
    if (conformant?.state !== "CONFORMANT") {
      fail("V could not transition S0 to CONFORMANT");
    }
    status = "AUTHORIZED_CONFORMANT";
    claim =
      "Controlled conditional release was runtime-observed under Threat Model T0 across the declared E1 transaction and E2 payload/provider enforcement surfaces of the closed local harness.";
    conformantStateWritten = true;
    finalState = conformant;
  } else {
    status = "CANDIDATE_AUTHORIZED_CONFORMANT";
    claim =
      "Candidate post-flight verification passed on a pull-request run; no final conformance state or authority claim is issued.";
    finalState = store.get(key);
  }

  const eventsAfter = store.listEvents(key);
  if (mode === "main") {
    check(
      "Final authority event",
      sameJson(eventsAfter.map((x) => x.newState), [
        "ISSUED",
        "PAYLOAD_STAGED",
        "TX_RESERVED",
        "TX_EXECUTED",
        "PAYLOAD_RELEASED",
        "CONFORMANT",
      ]) &&
        eventsAfter.at(-1)?.requestingComponent === "V",
      "only V appended the final CONFORMANT transition"
    );
  } else {
    check(
      "Candidate leaves state unchanged",
      finalState?.state === "PAYLOAD_RELEASED" &&
        !eventsAfter.some((x) => x.newState === "CONFORMANT"),
      "PR candidate verification does not write conformance"
    );
  }

  const authorityEventsBytes = Buffer.from(
    eventsAfter.map((x) => JSON.stringify(x)).join("\n") + "\n",
    "utf8"
  );
  const authorityEventsPath = path.join(outputDir, "authority-state-events.jsonl");
  await fs.writeFile(authorityEventsPath, authorityEventsBytes);

  const conformance = {
    schema: "workflow-observatory/postflight-conformance/v0",
    status,
    mode,
    claim,
    transition_commitment: transition.transitionCommitment,
    request_identity_sha256: candidate.admittedRequestIdentitySha256,
    warrant_issuer_key_id: verifiedWarrant.issuerKeyId,
    warrant_body_sha256: verifiedWarrant.bodySha256,
    nonce: verifiedWarrant.nonce,
    transaction_hash: txHash,
    derived_job_id: derivedJobId,
    payload_sha256: sha256Bytes(stagedPayload),
    provider_identity: providerObservation.provider_identity,
    s0_state: finalState.state,
    conformant_state_written: conformantStateWritten,
    verification_process: "separate-node-process/postflight-v0",
    paygod_integrity: independentPaygod.verification.integrity,
    paygod_issuer_authenticity: independentPaygod.verification.issuer_authenticity,
    paygod_decision_replay: independentPaygod.verification.replay,
    time_authority: "producer_supplied/local_harness",
    gate_zero_result: gateZeroResult.result,
    gate_zero_witness_status: gateZeroResult.witness_status,
    checks,
    attack_classifications: attackClassifications,
    limitations: [
      "not universal non-bypassability",
      "not production-independent enforcement",
      "not ACP/Quiver authority",
      "not external-provider acceptance",
      "not Warrant originality",
      "not trusted external time",
      "not economic fee authority",
      "not T1 rollback/host-compromise resistance",
    ],
  };

  const conformancePath = path.join(outputDir, "conformance.json");
  await fs.writeFile(
    conformancePath,
    JSON.stringify(conformance, null, 2) + "\n",
    "utf8"
  );

  const bundleSources = [
    [paths.requestIdentity, "request-identity.json"],
    [paths.requestShadow, "request-shadow.json"],
    [paths.transition, "transition-envelope.json"],
    [paths.candidate, "release-candidate.json"],
    [path.join(paths.paygodBundle, "receipt.json"), "paygod-receipt.json"],
    [path.join(paths.paygodBundle, "receipt.sig.json"), "paygod-receipt.sig.json"],
    [verifierResultPath, "paygod-independent-verification.json"],
    [paths.warrantBody, "warrant-body.json"],
    [paths.warrantSig, "warrant.sig"],
    [paths.issuanceAudit, "issuance-audit.json"],
    [paths.e2Stage, "e2-stage.json"],
    [paths.stagedPayload, "staged-payload.bin"],
    [paths.proposal, "transaction-proposal.json"],
    [paths.e1Execution, "e1-verification.json"],
    [paths.txEvidence, "tx-evidence.json"],
    [paths.transactionReceipt, "transaction-receipt.json"],
    [paths.instanceBinding, "instance-binding.json"],
    [paths.e2Release, "e2-release.json"],
    [paths.releasedPayload, "released-payload.bin"],
    [paths.providerObservation, "provider-observation.json"],
    [paths.providerPayload, "provider-received-payload.bin"],
    [paths.gateZeroResult, "gate-zero-result.json"],
    [authorityEventsPath, "authority-state-events.jsonl"],
    [conformancePath, "conformance.json"],
  ];

  const manifestFiles = [];
  for (const [source, name] of bundleSources) {
    manifestFiles.push(await copyExact(source, path.join(bundleDir, name)));
  }
  manifestFiles.sort((a, b) => a.name.localeCompare(b.name));

  const manifest = {
    schema: "workflow-observatory/postflight-bundle-manifest/v0",
    status,
    transition_commitment: transition.transitionCommitment,
    files: manifestFiles,
    limitations: conformance.limitations,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(bundleDir, "manifest.json"), manifestBytes);

  const result = {
    status,
    s0State: finalState.state,
    conformantStateWritten,
    transitionCommitment: transition.transitionCommitment,
    transactionHash: txHash,
    derivedJobId,
    payloadSha256: sha256Bytes(stagedPayload),
    providerIdentity: providerObservation.provider_identity,
    bundleManifestSha256: sha256Bytes(manifestBytes),
    checksPassed: checks.length,
    claim,
  };
  await fs.writeFile(
    path.join(outputDir, "verifier-summary.json"),
    JSON.stringify(result, null, 2) + "\n",
    "utf8"
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.close();
}

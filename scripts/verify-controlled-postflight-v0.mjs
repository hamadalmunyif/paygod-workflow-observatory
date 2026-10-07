#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { sha256Bytes } from "../src/digest.mjs";
import { verifyControlledDecisionAdmissionV0 } from "../src/controlled-decision-admission-v0.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { deriveMatchingJobInstanceV0 } from "../src/postflight-binding-v0.mjs";
import { parseExactTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";
import {
  CONTROLLED_ENFORCEMENT_DOMAIN,
  parseExactWarrantBodyV0,
  verifyWarrantV0,
} from "../src/warrant-v0.mjs";
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
function equal(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + " mismatch: " + String(actual) + " != " + String(expected));
  }
}
function truth(value, label) {
  if (value !== true) throw new Error(label + " must be true");
}
function runCast(args) {
  const result = spawnSync(castBin, args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      "cast failed: " + (result.stderr || result.stdout || "").trim()
    );
  }
  return result.stdout.trim().toLowerCase();
}

const requestShadowPath = requiredArg("--request-shadow");
const candidatePath = requiredArg("--release-candidate");
const profilePath = requiredArg("--release-profile");
const validatePath = requiredArg("--paygod-validate");
const paygodBundleDir = requiredArg("--paygod-bundle");
const decisionTrustStorePath = requiredArg("--decision-trust-store");
const warrantBodyPath = requiredArg("--warrant-body");
const warrantSignaturePath = requiredArg("--warrant-signature");
const trustPath = requiredArg("--warrant-trust-store");
const envelopePath = requiredArg("--transition-envelope");
const e2StagePath = requiredArg("--e2-stage");
const e1VerificationPath = requiredArg("--e1-verification");
const txEvidencePath = requiredArg("--tx-evidence");
const receiptPath = requiredArg("--transaction-receipt");
const instanceBindingPath = requiredArg("--instance-binding");
const e2ReleasePath = requiredArg("--e2-release");
const providerObservationPath = requiredArg("--provider-observation");
const releasedPayloadPath = requiredArg("--released-payload");
const providerPayloadPath = requiredArg("--provider-payload");
const gateZeroResultPath = requiredArg("--gate-zero-result");
const stateDbPath = requiredArg("--state-db");
const outputDir = requiredArg("--output-dir");
const castBin = argValue("--cast-bin") ?? "cast";
const pythonExecutable = argValue("--python") ?? "python3";
const paygodVerifier = "external/paygod-kernel/tools/verify_portable_evidence.py";

await fs.mkdir(outputDir, { recursive: true });

const paygodVerificationPath = path.join(
  outputDir,
  "paygod-verification.json"
);
const verifierRun = spawnSync(
  pythonExecutable,
  [
    paygodVerifier,
    paygodBundleDir,
    "--trusted-issuer-keys",
    decisionTrustStorePath,
    "--require-issuer-authenticity",
    "--result",
    paygodVerificationPath,
  ],
  { stdio: "inherit", env: process.env }
);
if (verifierRun.error) {
  throw new Error(
    "PayGod verifier could not be started: " + verifierRun.error.message
  );
}
if (verifierRun.status !== 0) {
  throw new Error(
    "PayGod verifier rejected the decision bundle (exit " +
      verifierRun.status +
      ")"
  );
}

const [
  requestShadow,
  candidateBytes,
  releaseProfile,
  paygodValidate,
  receiptBytes,
  paygodVerification,
  warrantBodyBytes,
  warrantSignatureBytes,
  trustBytes,
  envelopeBytes,
  e2Stage,
  e1Verification,
  txEvidenceBytes,
  receipt,
  instanceBinding,
  e2Release,
  providerObservation,
  releasedPayload,
  providerPayload,
  gateZero,
] = await Promise.all([
  readJson(requestShadowPath),
  fs.readFile(candidatePath),
  readJson(profilePath),
  readJson(validatePath),
  fs.readFile(path.join(paygodBundleDir, "receipt.json")),
  readJson(paygodVerificationPath),
  fs.readFile(warrantBodyPath),
  fs.readFile(warrantSignaturePath),
  fs.readFile(trustPath),
  fs.readFile(envelopePath),
  readJson(e2StagePath),
  readJson(e1VerificationPath),
  fs.readFile(txEvidencePath),
  readJson(receiptPath),
  readJson(instanceBindingPath),
  readJson(e2ReleasePath),
  readJson(providerObservationPath),
  fs.readFile(releasedPayloadPath),
  fs.readFile(providerPayloadPath),
  readJson(gateZeroResultPath),
]);

const transition = parseExactTransitionEnvelopeV0(envelopeBytes);
const txEvidence = JSON.parse(txEvidenceBytes.toString("utf8"));
const trust = trustedWarrantIssuersFromExternalTrustV0({
  trustStore: JSON.parse(trustBytes.toString("utf8")),
  trustStoreBytes: trustBytes,
});

const decision = verifyControlledDecisionAdmissionV0({
  candidateBytes,
  requestShadow,
  transitionEnvelopeBytes: envelopeBytes,
  releaseProfile,
  paygodValidate,
  receiptBytes,
  paygodVerification,
});
equal(
  decision.status,
  "AUTHENTICATED_CANONICAL_ALLOW",
  "decision admission status"
);
equal(
  decision.transitionCommitment,
  transition.transitionCommitment,
  "decision transition commitment"
);

const parsedWarrant = parseExactWarrantBodyV0(warrantBodyBytes);
const store = await openAuthorityStateStoreV0(stateDbPath);
try {
  const preConformanceEvents = store.listEvents({
    issuerKeyId: parsedWarrant.body.issuer_key_id,
    nonce: parsedWarrant.body.nonce,
  });
  const releaseEvents = preConformanceEvents.filter(
    (event) => event.newState === "PAYLOAD_RELEASED"
  );
  if (releaseEvents.length !== 1) {
    throw new Error(
      "exactly one PAYLOAD_RELEASED event is required before conformance"
    );
  }

  const warrant = verifyWarrantV0({
    bodyBytes: warrantBodyBytes,
    signatureBytes: warrantSignatureBytes,
    trustedIssuers: trust.trustedIssuers,
    expectedDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
    expectedTransitionCommitment: transition.transitionCommitment,
    nowMs: releaseEvents[0].eventTimestamp,
  });

  equal(e2Stage.status, "PAYLOAD_STAGED", "E2 stage status");
  truth(e2Stage.exactPayloadBytesPersisted, "E2 exact payload persistence");
  equal(e2Stage.transitionCommitment, transition.transitionCommitment, "E2 transition commitment");
  equal(e2Stage.warrantBodySha256, warrant.bodySha256, "E2 Warrant digest");

  equal(e1Verification.status, "TX_RESERVED", "E1 verification status");
  equal(e1Verification.warrant_verification, "VALID", "E1 Warrant verification");
  truth(e1Verification.trusted_issuer, "E1 trusted issuer");
  equal(e1Verification.transition_commitment, transition.transitionCommitment, "E1 transition commitment");
  equal(e1Verification.execution_account, transition.envelope.transaction.execution_account, "E1 execution account");
  equal(e1Verification.target, transition.envelope.transaction.target, "E1 target");
  equal(e1Verification.calldata_sha256, transition.envelope.transaction.calldata_sha256, "E1 calldata digest");

  const current = store.get({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
  });
  if (!current || current.state !== "PAYLOAD_RELEASED") {
    throw new Error(
      "conformance verification requires PAYLOAD_RELEASED, observed " +
        String(current?.state ?? "MISSING")
    );
  }

  const staged = store.getStagedPayload({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
  });
  if (!staged) throw new Error("staged payload missing at conformance");
  equal(staged.transitionCommitment, transition.transitionCommitment, "staged transition commitment");
  equal(staged.payloadSha256, transition.envelope.payload.payload_sha256, "staged payload digest");
  equal(staged.payloadRecipient, transition.envelope.payload.recipient, "staged provider");
  equal(staged.payloadContentType, transition.envelope.payload.content_type, "staged content type");
  equal(sha256Bytes(staged.payloadBytes), staged.payloadSha256, "staged bytes digest");

  if (!releasedPayload.equals(staged.payloadBytes)) {
    throw new Error("released payload bytes differ from immutable staged bytes");
  }
  if (!providerPayload.equals(staged.payloadBytes)) {
    throw new Error("provider-observed bytes differ from immutable staged bytes");
  }

  const txEvidenceSha256 = sha256Bytes(txEvidenceBytes);
  equal(current.txEvidenceSha256, txEvidenceSha256, "S0 transaction evidence digest");
  equal(txEvidence.transition_commitment, transition.transitionCommitment, "tx evidence transition commitment");
  equal(txEvidence.transaction_hash, String(receipt.transactionHash).toLowerCase(), "receipt transaction hash");

  const topic0 = runCast([
    "keccak",
    "JobCreated(uint256,address,address,address,uint256,bytes32,address)",
  ]);
  if (!/^0x[0-9a-f]{64}$/.test(topic0)) {
    throw new Error("pinned cast did not produce a valid JobCreated topic0");
  }
  const rederivedBinding = deriveMatchingJobInstanceV0({
    transition,
    observedChainId: txEvidence.chain_id,
    transaction: {
      hash: txEvidence.transaction_hash,
      from: txEvidence.from,
      to: txEvidence.to,
      input: txEvidence.input,
      value: txEvidence.value_hex,
    },
    receipt,
    jobCreatedTopic0: topic0,
  });

  equal(instanceBinding.classification, "INSTANCE_DERIVED_FROM_MATCHING_EXECUTION", "instance binding classification");
  equal(instanceBinding.transaction_hash, rederivedBinding.transaction_hash, "instance transaction");
  equal(instanceBinding.instance_id, rederivedBinding.instance_id, "instance id");
  equal(instanceBinding.provider, rederivedBinding.provider, "instance provider");
  equal(instanceBinding.execution_account, rederivedBinding.execution_account, "instance execution account");

  equal(e2Release.status, "PAYLOAD_RELEASED", "E2 release status");
  equal(e2Release.transition_commitment, transition.transitionCommitment, "release transition commitment");
  equal(e2Release.staged_payload_sha256, staged.payloadSha256, "release payload digest");
  equal(e2Release.committed_provider, staged.payloadRecipient, "release provider");
  equal(e2Release.instance_id, instanceBinding.instance_id, "release instance id");
  equal(e2Release.transaction_hash, instanceBinding.transaction_hash, "release transaction hash");
  equal(
    e2Release.payload_content_type,
    staged.payloadContentType,
    "release payload content type"
  );
  equal(
    e2Release.released_at_ms,
    releaseEvents[0].eventTimestamp,
    "release event time"
  );
  truth(e2Release.exact_staged_bytes_released, "release exact staged bytes");
  equal(e2Release.provider_delivery, "OBSERVED", "provider delivery status");

  equal(providerObservation.status, "OBSERVED", "provider observation status");
  equal(providerObservation.observation_grade, "RUNTIME_OBSERVED", "provider observation grade");
  equal(providerObservation.payload_sha256, staged.payloadSha256, "provider payload digest");
  equal(providerObservation.payload_byte_length, staged.payloadByteLength, "provider payload length");
  equal(
    providerObservation.content_type,
    staged.payloadContentType,
    "provider payload content type"
  );
  equal(providerObservation.provider_identity, staged.payloadRecipient, "provider identity");
  equal(providerObservation.transition_commitment, transition.transitionCommitment, "provider transition commitment");
  equal(providerObservation.instance_id, instanceBinding.instance_id, "provider instance id");
  equal(providerObservation.transaction_hash, instanceBinding.transaction_hash, "provider transaction hash");
  if (
    !Number.isSafeInteger(providerObservation.observed_at_ms) ||
    providerObservation.observed_at_ms < e2Release.released_at_ms
  ) {
    throw new Error("provider observation time precedes PAYLOAD_RELEASED");
  }
  const isMainPush =
    process.env.GITHUB_EVENT_NAME === "push" &&
    process.env.GITHUB_REF === "refs/heads/main";
  const expectedGateZeroResult = isMainPush
    ? "NO_BYPASS_OBSERVED_UNDER_T0_E1_PRE_PROVIDER"
    : "CANDIDATE_T0_WITNESS_PASSED_ON_PR";
  const expectedGateZeroStatus = isMainPush
    ? "MAIN_PUSH_WITNESS"
    : "PR_CANDIDATE_ONLY";
  equal(gateZero?.result, expectedGateZeroResult, "Gate Zero result");
  equal(
    gateZero?.witness_status,
    expectedGateZeroStatus,
    "Gate Zero witness status"
  );
  if (gateZero?.totals?.bypass_observed !== 0) {
    throw new Error("Gate Zero evidence contains a bypass");
  }
  if (gateZero?.totals?.harness_defect !== 0) {
    throw new Error("Gate Zero evidence contains a harness defect");
  }
  if (
    gateZero?.totals?.declared !== gateZero?.totals?.rejected_as_expected
  ) {
    throw new Error("Gate Zero frozen attempt set is incomplete");
  }

  const conformed = store.markConformant({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
    transitionCommitment: transition.transitionCommitment,
    enforcementDomain: trust.enforcementDomain,
    requestedBy: "V",
  });
  if (conformed?.state !== "CONFORMANT") {
    throw new Error("S0 did not reach CONFORMANT");
  }

  const events = store.listEvents({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
  });
  const expectedStates = [
    "ISSUED",
    "PAYLOAD_STAGED",
    "TX_RESERVED",
    "TX_EXECUTED",
    "PAYLOAD_RELEASED",
    "CONFORMANT",
  ];
  const observedStates = events.map((x) => x.newState);
  if (JSON.stringify(observedStates) !== JSON.stringify(expectedStates)) {
    throw new Error(
      "authority-state event sequence mismatch: " + JSON.stringify(observedStates)
    );
  }
  if (!events.every((x) => x.result === "SUCCESS")) {
    throw new Error("authority-state success event log contains non-success entry");
  }

  const eventLines = events
    .map((event) =>
      JSON.stringify({
        event_index: event.eventIndex,
        issuer_key_id: event.issuerKeyId,
        nonce: event.nonce,
        transition_commitment: event.transitionCommitment,
        prior_state: event.priorState,
        new_state: event.newState,
        event_type: event.eventType,
        event_timestamp_ms: event.eventTimestamp,
        requesting_component: event.requestingComponent,
        result: event.result,
      })
    )
    .join("\n") + "\n";

  const conformance = {
    schema: "workflow-observatory/postflight-conformance/v0",
    outcome: "AUTHORIZED_CONFORMANT",
    verification_boundary: "closed-harness independent-process verification",
    transition_commitment: transition.transitionCommitment,
    request_identity_sha256: transition.envelope.request_identity_sha256,
    warrant_body_sha256: warrant.bodySha256,
    warrant_issuer_key_id: warrant.issuerKeyId,
    nonce: warrant.nonce,
    payload_sha256: staged.payloadSha256,
    transaction_hash: instanceBinding.transaction_hash,
    tx_evidence_sha256: txEvidenceSha256,
    instance_binding: instanceBinding.classification,
    instance_id: instanceBinding.instance_id,
    provider_identity: staged.payloadRecipient,
    provider_observation: "RUNTIME_OBSERVED",
    gate_zero_bypass_observed: 0,
    gate_zero_harness_defect: 0,
    gate_zero_witness_status: gateZero.witness_status,
    official_main_two_surface_witness: isMainPush,
    authority_state_sequence: observedStates,
    final_s0_state: conformed.state,
    trusted_external_time_proven: false,
    decision_replay_performed: false,
    external_provider_independence_proven: false,
    economic_fee_authority_proven: false,
    warrant_originality_proven: false,
    paygod_decision_independently_reverified: true,
    warrant_verified_at_release_event_time: true,
  };

  await Promise.all([
    fs.writeFile(
      path.join(outputDir, "authority-state-events.jsonl"),
      eventLines,
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "conformance.json"),
      JSON.stringify(conformance, null, 2) + "\n",
      "utf8"
    ),
  ]);

  console.log(JSON.stringify(conformance, null, 2));
} finally {
  store.close();
}

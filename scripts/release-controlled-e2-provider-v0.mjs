#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { sha256Bytes } from "../src/digest.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
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

function requireHex32(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(label + " must be 0x-prefixed 32-byte hex");
  }
  return value.toLowerCase();
}

function requireAddress(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(label + " must be an EVM address");
  }
  return value.toLowerCase();
}

function calldataBytesFromHex(value) {
  if (typeof value !== "string" || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error("proposal calldata_hex must be lowercase 0x-prefixed whole bytes");
  }
  return Buffer.from(value.slice(2), "hex");
}

function receiptSucceeded(status) {
  return status === "0x1" || status === "0x01" || status === 1 || status === "1";
}

async function rpcCall(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error("RPC HTTP failure for " + method + ": " + response.status);
  const body = await response.json();
  if (body.error) throw new Error("RPC error for " + method + ": " + JSON.stringify(body.error));
  return body.result;
}

function runCast(castBin, args) {
  const result = spawnSync(castBin, args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw new Error("cast could not start: " + result.error.message);
  if (result.status !== 0) {
    throw new Error("cast failed: " + (result.stderr || result.stdout || "").trim());
  }
  return result.stdout.trim();
}

function topicAddress(topic, label) {
  const value = requireHex32(topic, label);
  if (!/^0x0{24}[0-9a-f]{40}$/.test(value)) {
    throw new Error(label + " is not a canonically padded indexed address");
  }
  return "0x" + value.slice(-40);
}

function topicUintDecimal(topic, label) {
  const value = requireHex32(topic, label);
  const n = BigInt(value);
  if (n <= 0n) throw new Error(label + " must be positive");
  return n.toString(10);
}

const warrantBodyPath = requiredArg("--warrant-body");
const warrantSignaturePath = requiredArg("--warrant-signature");
const warrantTrustStorePath = requiredArg("--warrant-trust-store");
const transitionEnvelopePath = requiredArg("--transition-envelope");
const transactionProposalPath = requiredArg("--transaction-proposal");
const txEvidencePath = requiredArg("--tx-evidence");
const stateDbPath = requiredArg("--state-db");
const rpcUrl = requiredArg("--rpc-url");
const providerUrl = requiredArg("--provider-url");
const outputDir = requiredArg("--output-dir");
const castBin = argValue("--cast-bin") ?? "cast";

if (providerUrl !== "http://127.0.0.1:18547/release") {
  throw new Error("v0 provider URL must be the frozen loopback ingress");
}

await fs.mkdir(outputDir, { recursive: true });

const [
  warrantBodyBytes,
  warrantSignatureBytes,
  warrantTrustStoreBytes,
  transitionEnvelopeBytes,
  proposal,
  txEvidenceBytes,
] = await Promise.all([
  fs.readFile(warrantBodyPath),
  fs.readFile(warrantSignaturePath),
  fs.readFile(warrantTrustStorePath),
  fs.readFile(transitionEnvelopePath),
  fs.readFile(transactionProposalPath, "utf8").then(JSON.parse),
  fs.readFile(txEvidencePath),
]);

let txEvidence;
let trustStore;
try {
  txEvidence = JSON.parse(txEvidenceBytes.toString("utf8"));
  trustStore = JSON.parse(warrantTrustStoreBytes.toString("utf8"));
} catch {
  throw new Error("transaction evidence or Warrant trust store is not valid JSON");
}

if (proposal?.schema !== "workflow-observatory/local-evm-transaction-proposal/v0") {
  throw new Error("unexpected transaction proposal schema");
}
if (txEvidence?.schema !== "workflow-observatory/local-e1-tx-evidence/v0") {
  throw new Error("unexpected E1 transaction evidence schema");
}

const trusted = trustedWarrantIssuersFromExternalTrustV0({
  trustStore,
  trustStoreBytes: warrantTrustStoreBytes,
});
const transition = parseExactTransitionEnvelopeV0(transitionEnvelopeBytes);

const store = await openAuthorityStateStoreV0(stateDbPath);
let releaseSummary = null;
try {
  const nowMs = store.currentTimeMs();
  const warrant = verifyWarrantV0({
    bodyBytes: warrantBodyBytes,
    signatureBytes: warrantSignatureBytes,
    trustedIssuers: trusted.trustedIssuers,
    expectedDomain: trusted.enforcementDomain,
    expectedTransitionCommitment: transition.transitionCommitment,
    nowMs,
  });

  const row = store.get({ issuerKeyId: warrant.issuerKeyId, nonce: warrant.nonce });
  if (!row || row.state !== "TX_EXECUTED") {
    throw new Error("E2 release requires durable S0 TX_EXECUTED");
  }
  if (
    row.transitionCommitment !== transition.transitionCommitment ||
    row.enforcementDomain !== warrant.enforcementDomain ||
    row.warrantBodySha256 !== warrant.bodySha256
  ) {
    throw new Error("S0 authority binding differs from Warrant/transition");
  }

  const staged = store.getStagedPayload({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
  });
  if (!staged || !Buffer.isBuffer(staged.payloadBytes)) {
    throw new Error("immutable staged payload is missing");
  }

  const expectedPayload = transition.envelope.payload;
  const stagedDigest = sha256Bytes(staged.payloadBytes);
  if (
    stagedDigest !== expectedPayload.payload_sha256 ||
    staged.payloadSha256 !== expectedPayload.payload_sha256 ||
    staged.payloadChannel !== expectedPayload.channel ||
    staged.payloadRecipient !== expectedPayload.recipient ||
    staged.payloadContentType !== expectedPayload.content_type
  ) {
    throw new Error("staged payload surface differs from committed transition");
  }

  const txEvidenceSha256 = sha256Bytes(txEvidenceBytes);
  if (row.txEvidenceSha256 !== txEvidenceSha256) {
    throw new Error("E1 transaction evidence digest differs from S0 commitment");
  }
  if (txEvidence.transition_commitment !== transition.transitionCommitment) {
    throw new Error("E1 transaction evidence transition commitment mismatch");
  }

  const txHash = requireHex32(txEvidence.transaction_hash, "transaction hash");
  const [chainIdHex, tx, receipt] = await Promise.all([
    rpcCall(rpcUrl, "eth_chainId"),
    rpcCall(rpcUrl, "eth_getTransactionByHash", [txHash]),
    rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]),
  ]);
  if (!tx || !receipt) throw new Error("authorized transaction or receipt is unavailable");
  if (requireHex32(receipt.transactionHash, "receipt transactionHash") !== txHash) {
    throw new Error("receipt does not belong to the authorized transaction hash");
  }
  if (!receiptSucceeded(receipt.status)) {
    throw new Error("authorized transaction receipt is not successful");
  }

  const expectedTx = transition.envelope.transaction;
  const observedChainId = Number.parseInt(chainIdHex, 16);
  const observedFrom = requireAddress(tx.from, "transaction sender");
  const observedTo = requireAddress(tx.to, "transaction target");
  const observedInput = String(tx.input ?? "").toLowerCase();
  const proposalCalldata = calldataBytesFromHex(proposal.calldata_hex);

  if (
    observedChainId !== expectedTx.chain_id ||
    observedFrom !== expectedTx.execution_account ||
    observedTo !== expectedTx.target ||
    sha256Bytes(Buffer.from(observedInput.slice(2), "hex")) !== expectedTx.calldata_sha256 ||
    sha256Bytes(proposalCalldata) !== expectedTx.calldata_sha256 ||
    BigInt(tx.value) !== BigInt(expectedTx.native_value)
  ) {
    throw new Error("chain readback does not conform to committed transaction surface");
  }

  const eventSignature =
    "JobCreated(uint256,address,address,address,uint256,bytes32,address)";
  const topic0 = runCast(castBin, ["keccak", eventSignature]).toLowerCase();

  const matchingLogs = (Array.isArray(receipt.logs) ? receipt.logs : []).filter((log) => {
    const topics = Array.isArray(log?.topics) ? log.topics.map((x) => String(x).toLowerCase()) : [];
    return (
      requireAddress(log?.address, "receipt log address") === expectedTx.target &&
      topics.length === 4 &&
      topics[0] === topic0
    );
  });

  if (matchingLogs.length !== 1) {
    throw new Error("expected exactly one matching JobCreated event");
  }

  const log = matchingLogs[0];
  const topics = log.topics.map((x) => String(x).toLowerCase());
  const jobId = topicUintDecimal(topics[1], "JobCreated.jobId");
  const eventClient = topicAddress(topics[2], "JobCreated.client");
  const eventProvider = topicAddress(topics[3], "JobCreated.provider");

  if (eventClient !== expectedTx.execution_account) {
    throw new Error("JobCreated client differs from committed execution account");
  }
  if (eventProvider !== expectedPayload.recipient) {
    throw new Error("JobCreated provider differs from committed payload recipient");
  }

  const transactionReceipt = {
    schema: "workflow-observatory/local-transaction-receipt/v0",
    transaction_hash: txHash,
    receipt,
  };
  const instanceBinding = {
    schema: "workflow-observatory/instance-binding/v0",
    classification: "INSTANCE_DERIVED_FROM_MATCHING_EXECUTION",
    transition_commitment: transition.transitionCommitment,
    transaction_hash: txHash,
    contract: expectedTx.target,
    event_signature: eventSignature,
    event_topic0: topic0,
    derived_job_id: jobId,
    indexed_client: eventClient,
    indexed_provider: eventProvider,
  };

  await Promise.all([
    fs.writeFile(
      path.join(outputDir, "transaction-receipt.json"),
      JSON.stringify(transactionReceipt, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "instance-binding.json"),
      JSON.stringify(instanceBinding, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(path.join(outputDir, "released-payload.bin"), staged.payloadBytes),
  ]);

  const released = store.releasePayload({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
    transitionCommitment: transition.transitionCommitment,
    enforcementDomain: warrant.enforcementDomain,
    payloadSha256: stagedDigest,
  });
  if (released?.state !== "PAYLOAD_RELEASED") {
    throw new Error("S0 did not reach PAYLOAD_RELEASED");
  }

  releaseSummary = {
    schema: "workflow-observatory/e2-release/v0",
    status: "PAYLOAD_RELEASED",
    transition_commitment: transition.transitionCommitment,
    warrant_issuer_key_id: warrant.issuerKeyId,
    warrant_body_sha256: warrant.bodySha256,
    nonce: warrant.nonce,
    staged_payload_sha256: stagedDigest,
    payload_byte_length: staged.payloadBytes.length,
    payload_channel: staged.payloadChannel,
    payload_recipient: staged.payloadRecipient,
    payload_content_type: staged.payloadContentType,
    tx_evidence_sha256: txEvidenceSha256,
    transaction_hash: txHash,
    instance_binding: instanceBinding.classification,
    derived_job_id: jobId,
    s0_state: released.state,
    provider_delivery_attempted: false,
    provider_observation_confirmed: false,
  };

  await fs.writeFile(
    path.join(outputDir, "e2-release.json"),
    JSON.stringify(releaseSummary, null, 2) + "\n",
    "utf8"
  );

  let response;
  try {
    response = await fetch(providerUrl, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-paygod-provider": staged.payloadRecipient,
        "x-paygod-transition": transition.transitionCommitment,
        "x-paygod-job-id": jobId,
        "x-paygod-tx-hash": txHash,
        "x-paygod-payload-content-type": staged.payloadContentType,
      },
      body: staged.payloadBytes,
    });
  } catch (err) {
    releaseSummary.status = "PAYLOAD_RELEASED_PROVIDER_DELIVERY_FAILED";
    releaseSummary.provider_delivery_attempted = true;
    releaseSummary.provider_delivery_error = String(err?.message ?? err);
    await fs.writeFile(
      path.join(outputDir, "e2-release.json"),
      JSON.stringify(releaseSummary, null, 2) + "\n",
      "utf8"
    );
    throw err;
  }

  const providerText = await response.text();
  if (!response.ok) {
    releaseSummary.status = "PAYLOAD_RELEASED_PROVIDER_DELIVERY_FAILED";
    releaseSummary.provider_delivery_attempted = true;
    releaseSummary.provider_http_status = response.status;
    releaseSummary.provider_response = providerText.slice(0, 1000);
    await fs.writeFile(
      path.join(outputDir, "e2-release.json"),
      JSON.stringify(releaseSummary, null, 2) + "\n",
      "utf8"
    );
    throw new Error("provider rejected released payload after S0 PAYLOAD_RELEASED");
  }

  releaseSummary.status = "PAYLOAD_RELEASED_PROVIDER_OBSERVED";
  releaseSummary.provider_delivery_attempted = true;
  releaseSummary.provider_observation_confirmed = true;
  releaseSummary.provider_http_status = response.status;

  await fs.writeFile(
    path.join(outputDir, "e2-release.json"),
    JSON.stringify(releaseSummary, null, 2) + "\n",
    "utf8"
  );

  const events = store.listEvents({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
  });
  await fs.writeFile(
    path.join(outputDir, "authority-state-events.jsonl"),
    events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    "utf8"
  );

  console.log(JSON.stringify(releaseSummary, null, 2));
} finally {
  store.close();
}

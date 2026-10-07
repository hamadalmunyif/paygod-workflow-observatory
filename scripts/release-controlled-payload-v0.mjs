#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { sha256Bytes } from "../src/digest.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { deriveMatchingJobInstanceV0 } from "../src/postflight-binding-v0.mjs";
import { parseExactTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";
import {
  CONTROLLED_ENFORCEMENT_DOMAIN,
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
async function rpcCall(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error("RPC HTTP failure for " + method + ": " + response.status);
  }
  const body = await response.json();
  if (body.error) {
    throw new Error("RPC error for " + method + ": " + JSON.stringify(body.error));
  }
  return body.result;
}
function runCast(castBin, args) {
  const result = spawnSync(castBin, args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("cast failed: " + (result.stderr || result.stdout || "").trim());
  }
  return result.stdout.trim();
}
function lowerHex(value, bytes, label) {
  const re = new RegExp("^0x[0-9a-fA-F]{" + bytes * 2 + "}$");
  if (typeof value !== "string" || !re.test(value)) {
    throw new Error(label + " has invalid hex profile");
  }
  return value.toLowerCase();
}
function sameQuantity(a, b) {
  return BigInt(a) === BigInt(b);
}
function requireEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(label + " mismatch");
}

for (const forbidden of [
  "--payload",
  "--payload-bytes",
  "--provider-recipient",
  "--job-id",
  "--instance-id",
]) {
  if (process.argv.includes(forbidden)) {
    throw new Error(
      "E2_RELEASE_CALLER_OVERRIDE_FORBIDDEN: " + forbidden
    );
  }
}

const warrantBodyPath = requiredArg("--warrant-body");
const warrantSignaturePath = requiredArg("--warrant-signature");
const trustPath = requiredArg("--warrant-trust-store");
const envelopePath = requiredArg("--transition-envelope");
const txEvidencePath = requiredArg("--tx-evidence");
const stateDbPath = requiredArg("--state-db");
const rpcUrl = requiredArg("--rpc-url");
const providerUrl = requiredArg("--provider-url");
const outputDir = requiredArg("--output-dir");
const castBin = argValue("--cast-bin") ?? "cast";

await fs.mkdir(outputDir, { recursive: true });

const [
  warrantBodyBytes,
  warrantSignatureBytes,
  trustBytes,
  envelopeBytes,
  txEvidenceBytes,
] = await Promise.all([
  fs.readFile(warrantBodyPath),
  fs.readFile(warrantSignaturePath),
  fs.readFile(trustPath),
  fs.readFile(envelopePath),
  fs.readFile(txEvidencePath),
]);

const trustStore = JSON.parse(trustBytes.toString("utf8"));
const trusted = trustedWarrantIssuersFromExternalTrustV0({
  trustStore,
  trustStoreBytes: trustBytes,
});
const transition = parseExactTransitionEnvelopeV0(envelopeBytes);
const txEvidence = JSON.parse(txEvidenceBytes.toString("utf8"));
if (txEvidence?.schema !== "workflow-observatory/local-e1-tx-evidence/v0") {
  throw new Error("unexpected E1 transaction evidence schema");
}
const txEvidenceSha256 = sha256Bytes(txEvidenceBytes);

const store = await openAuthorityStateStoreV0(stateDbPath);
try {
  const warrant = verifyWarrantV0({
    bodyBytes: warrantBodyBytes,
    signatureBytes: warrantSignatureBytes,
    trustedIssuers: trusted.trustedIssuers,
    expectedDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
    expectedTransitionCommitment: transition.transitionCommitment,
    nowMs: store.currentTimeMs(),
  });

  const state = store.get({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
  });
  if (!state || state.state !== "TX_EXECUTED") {
    throw new Error(
      "E2 release requires durable TX_EXECUTED, observed " +
        String(state?.state ?? "MISSING")
    );
  }
  requireEqual(
    state.transitionCommitment,
    transition.transitionCommitment,
    "S0 transition commitment"
  );
  requireEqual(state.warrantBodySha256, warrant.bodySha256, "S0 Warrant body digest");
  requireEqual(state.txEvidenceSha256, txEvidenceSha256, "S0 transaction evidence digest");

  const staged = store.getStagedPayload({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
  });
  if (!staged) throw new Error("staged payload is missing from S0");
  requireEqual(
    staged.transitionCommitment,
    transition.transitionCommitment,
    "staged transition commitment"
  );
  requireEqual(staged.warrantBodySha256, warrant.bodySha256, "staged Warrant body digest");
  requireEqual(
    staged.payloadSha256,
    transition.envelope.payload.payload_sha256,
    "staged payload digest"
  );
  requireEqual(
    staged.payloadChannel,
    transition.envelope.payload.channel,
    "staged payload channel"
  );
  requireEqual(
    staged.payloadRecipient,
    transition.envelope.payload.recipient,
    "staged payload recipient"
  );
  requireEqual(
    staged.payloadContentType,
    transition.envelope.payload.content_type,
    "staged payload content type"
  );
  requireEqual(
    sha256Bytes(staged.payloadBytes),
    staged.payloadSha256,
    "staged payload bytes digest"
  );

  const txHash = lowerHex(txEvidence.transaction_hash, 32, "tx evidence hash");
  const [chainIdHex, transaction, receipt] = await Promise.all([
    rpcCall(rpcUrl, "eth_chainId"),
    rpcCall(rpcUrl, "eth_getTransactionByHash", [txHash]),
    rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]),
  ]);
  if (!transaction || !receipt) {
    throw new Error("post-flight transaction or receipt is missing");
  }

  requireEqual(
    String(transaction.hash ?? "").toLowerCase(),
    txHash,
    "chain transaction hash"
  );
  requireEqual(
    String(receipt.transactionHash ?? "").toLowerCase(),
    txHash,
    "receipt transaction hash"
  );
  requireEqual(
    Number.parseInt(chainIdHex, 16),
    txEvidence.chain_id,
    "tx evidence chain id"
  );
  requireEqual(
    String(transaction.from).toLowerCase(),
    txEvidence.from,
    "tx evidence sender"
  );
  requireEqual(
    String(transaction.to).toLowerCase(),
    txEvidence.to,
    "tx evidence target"
  );
  requireEqual(
    String(transaction.input ?? "").toLowerCase(),
    txEvidence.input,
    "tx evidence calldata"
  );
  if (!sameQuantity(transaction.value, txEvidence.value_hex)) {
    throw new Error("tx evidence native value mismatch");
  }
  requireEqual(String(receipt.status).toLowerCase(), String(txEvidence.receipt_status).toLowerCase(), "tx evidence receipt status");
  requireEqual(String(receipt.blockHash).toLowerCase(), txEvidence.block_hash, "tx evidence block hash");
  requireEqual(String(receipt.blockNumber).toLowerCase(), txEvidence.block_number, "tx evidence block number");

  const topic0 = lowerHex(
    runCast(castBin, [
      "keccak",
      "JobCreated(uint256,address,address,address,uint256,bytes32,address)",
    ]),
    32,
    "JobCreated topic0"
  );

  const binding = deriveMatchingJobInstanceV0({
    transition,
    observedChainId: Number.parseInt(chainIdHex, 16),
    transaction,
    receipt,
    jobCreatedTopic0: topic0,
  });

  const released = store.releasePayload({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
    transitionCommitment: transition.transitionCommitment,
    enforcementDomain: trusted.enforcementDomain,
    payloadSha256: staged.payloadSha256,
    requestedBy: "E2",
  });
  if (released?.state !== "PAYLOAD_RELEASED") {
    throw new Error("S0 did not reach PAYLOAD_RELEASED");
  }

  const releaseEvidence = {
    schema: "workflow-observatory/e2-release/v0",
    status: "PAYLOAD_RELEASED",
    warrant_verification: "VALID",
    trusted_issuer: true,
    enforcement_domain: trusted.enforcementDomain,
    transition_commitment: transition.transitionCommitment,
    warrant_body_sha256: warrant.bodySha256,
    nonce: warrant.nonce,
    staged_payload_sha256: staged.payloadSha256,
    staged_payload_byte_length: staged.payloadByteLength,
    payload_channel: staged.payloadChannel,
    committed_provider: staged.payloadRecipient,
    payload_content_type: staged.payloadContentType,
    tx_evidence_sha256: txEvidenceSha256,
    transaction_hash: binding.transaction_hash,
    instance_binding_classification: binding.classification,
    instance_id: binding.instance_id,
    s0_state_before: "TX_EXECUTED",
    s0_state_after: released.state,
    released_at_ms: released.updatedAt,
    exact_staged_bytes_released: true,
    provider_delivery: "PENDING",
  };

  await Promise.all([
    fs.writeFile(
      path.join(outputDir, "instance-binding.json"),
      JSON.stringify(binding, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "released-payload.bin"),
      staged.payloadBytes
    ),
    fs.writeFile(
      path.join(outputDir, "transaction-receipt.json"),
      JSON.stringify(receipt, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "e2-release.json"),
      JSON.stringify(releaseEvidence, null, 2) + "\n",
      "utf8"
    ),
  ]);

  const response = await fetch(providerUrl, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-paygod-transition-commitment": transition.transitionCommitment,
      "x-paygod-instance-id": binding.instance_id,
      "x-paygod-transaction-hash": binding.transaction_hash,
      "x-paygod-provider-recipient": staged.payloadRecipient,
      "x-paygod-payload-sha256": staged.payloadSha256,
      "x-paygod-payload-content-type": staged.payloadContentType,
    },
    body: staged.payloadBytes,
  });
  const responseText = await response.text();
  let providerResponse;
  try {
    providerResponse = JSON.parse(responseText);
  } catch {
    throw new Error("provider returned non-JSON response");
  }
  if (!response.ok || providerResponse?.status !== "OBSERVED") {
    throw new Error(
      "provider did not observe released payload: " + response.status + " " + responseText
    );
  }
  requireEqual(
    providerResponse.payload_sha256,
    staged.payloadSha256,
    "provider response payload digest"
  );
  requireEqual(
    providerResponse.transition_commitment,
    transition.transitionCommitment,
    "provider response transition commitment"
  );
  requireEqual(
    providerResponse.instance_id,
    binding.instance_id,
    "provider response instance id"
  );
  requireEqual(
    providerResponse.provider_identity,
    staged.payloadRecipient,
    "provider response identity"
  );

  releaseEvidence.provider_delivery = "OBSERVED";
  releaseEvidence.provider_observation_grade = providerResponse.observation_grade;
  await fs.writeFile(
    path.join(outputDir, "e2-release.json"),
    JSON.stringify(releaseEvidence, null, 2) + "\n",
    "utf8"
  );

  console.log(JSON.stringify(releaseEvidence, null, 2));
} finally {
  store.close();
}

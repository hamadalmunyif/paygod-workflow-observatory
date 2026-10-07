import { spawnSync } from "node:child_process";

import { authorityFail } from "./authority-error.mjs";
import { sha256Bytes } from "./digest.mjs";
import { parseExactTransitionEnvelopeV0 } from "./transition-envelope-v0.mjs";
import {
  CONTROLLED_ENFORCEMENT_DOMAIN,
  verifyWarrantV0,
} from "./warrant-v0.mjs";

const JOB_CREATED_SIGNATURE =
  "JobCreated(uint256,address,address,address,uint256,bytes32,address)";

function requireBytes(value, code, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  authorityFail(code, label + " must be explicit bytes");
}
function requireString(value, code, label) {
  if (typeof value !== "string" || value.length === 0) {
    authorityFail(code, label + " must be a non-empty string");
  }
  return value;
}
function lowerAddress(value, code, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    authorityFail(code, label + " must be an EVM address");
  }
  return value.toLowerCase();
}
function topicAddress(topic, code, label) {
  if (typeof topic !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(topic)) {
    authorityFail(code, label + " must be a 32-byte topic");
  }
  return "0x" + topic.slice(-40).toLowerCase();
}
function topicUint(topic, code, label) {
  if (typeof topic !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(topic)) {
    authorityFail(code, label + " must be a 32-byte topic");
  }
  return BigInt(topic).toString(10);
}
function runCast(castBin, args) {
  const r = spawnSync(castBin, args, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    authorityFail(
      "E2_EVENT_TOPIC_DERIVATION_FAILED",
      "pinned cast could not derive JobCreated event topic"
    );
  }
  return r.stdout.trim().toLowerCase();
}
async function rpcCall(rpcUrl, method, params = []) {
  let response;
  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  } catch (err) {
    authorityFail("E2_RPC_UNREACHABLE", "local chain RPC is unreachable", {
      cause: String(err?.message ?? err),
    });
  }
  if (!response.ok) {
    authorityFail("E2_RPC_HTTP_ERROR", "local chain RPC returned HTTP failure");
  }
  const body = await response.json();
  if (body.error) {
    authorityFail("E2_RPC_ERROR", "local chain RPC returned JSON-RPC error");
  }
  return body.result;
}
function receiptSucceeded(status) {
  return status === "0x1" || status === "0x01" || status === 1 || status === "1";
}

export async function releaseStagedPayloadThroughE2V0({
  warrantBodyBytes,
  warrantSignatureBytes,
  trustedWarrantIssuers,
  transitionEnvelopeBytes,
  txEvidenceBytes,
  authorityStateStore,
  rpcUrl,
  providerUrl,
  castBin = "cast",
  expectedDomain = CONTROLLED_ENFORCEMENT_DOMAIN,
}) {
  if (
    !authorityStateStore ||
    typeof authorityStateStore.currentTimeMs !== "function" ||
    typeof authorityStateStore.get !== "function" ||
    typeof authorityStateStore.getStagedPayload !== "function" ||
    typeof authorityStateStore.releasePayload !== "function"
  ) {
    authorityFail("E2_RELEASE_S0_REQUIRED", "constrained S0 access is required");
  }

  const exactWarrantBody = requireBytes(
    warrantBodyBytes,
    "E2_RELEASE_WARRANT_BODY_REQUIRED",
    "warrantBodyBytes"
  );
  const exactWarrantSig = requireBytes(
    warrantSignatureBytes,
    "E2_RELEASE_WARRANT_SIGNATURE_REQUIRED",
    "warrantSignatureBytes"
  );
  const exactEnvelope = requireBytes(
    transitionEnvelopeBytes,
    "E2_RELEASE_TRANSITION_REQUIRED",
    "transitionEnvelopeBytes"
  );
  const exactTxEvidence = requireBytes(
    txEvidenceBytes,
    "E2_RELEASE_TX_EVIDENCE_REQUIRED",
    "txEvidenceBytes"
  );
  requireString(rpcUrl, "E2_RELEASE_RPC_REQUIRED", "rpcUrl");
  requireString(providerUrl, "E2_RELEASE_PROVIDER_URL_REQUIRED", "providerUrl");

  const transition = parseExactTransitionEnvelopeV0(exactEnvelope);
  const warrant = verifyWarrantV0({
    bodyBytes: exactWarrantBody,
    signatureBytes: exactWarrantSig,
    trustedIssuers: trustedWarrantIssuers,
    expectedDomain,
    expectedTransitionCommitment: transition.transitionCommitment,
    nowMs: authorityStateStore.currentTimeMs(),
  });

  let txEvidence;
  try {
    txEvidence = JSON.parse(exactTxEvidence.toString("utf8"));
  } catch {
    authorityFail("E2_RELEASE_TX_EVIDENCE_INVALID", "transaction evidence is not JSON");
  }
  if (txEvidence?.schema !== "workflow-observatory/local-e1-tx-evidence/v0") {
    authorityFail("E2_RELEASE_TX_EVIDENCE_PROFILE", "unexpected transaction evidence schema");
  }

  const key = { issuerKeyId: warrant.issuerKeyId, nonce: warrant.nonce };
  const state = authorityStateStore.get(key);
  if (!state) {
    authorityFail("E2_RELEASE_S0_RECORD_NOT_FOUND", "authority state was not found");
  }
  if (state.state !== "TX_EXECUTED") {
    authorityFail(
      "E2_RELEASE_STATE_INVALID",
      "payload release requires TX_EXECUTED, observed " + state.state
    );
  }
  if (
    state.transitionCommitment !== transition.transitionCommitment ||
    state.warrantBodySha256 !== warrant.bodySha256
  ) {
    authorityFail("E2_RELEASE_S0_BINDING_MISMATCH", "S0 binding differs from Warrant/transition");
  }

  const staged = authorityStateStore.getStagedPayload(key);
  if (!staged) {
    authorityFail("E2_RELEASE_STAGE_MISSING", "immutable staged payload is missing");
  }
  const committedPayload = transition.envelope.payload;
  if (
    staged.transitionCommitment !== transition.transitionCommitment ||
    staged.warrantBodySha256 !== warrant.bodySha256 ||
    staged.payloadSha256 !== committedPayload.payload_sha256 ||
    staged.payloadChannel !== committedPayload.channel ||
    staged.payloadRecipient !== committedPayload.recipient ||
    staged.payloadContentType !== committedPayload.content_type ||
    sha256Bytes(staged.payloadBytes) !== committedPayload.payload_sha256
  ) {
    authorityFail("E2_RELEASE_STAGE_BINDING_MISMATCH", "staged payload differs from committed surface");
  }

  const txEvidenceSha256 = sha256Bytes(exactTxEvidence);
  if (state.txEvidenceSha256 !== txEvidenceSha256) {
    authorityFail(
      "E2_RELEASE_TX_EVIDENCE_DIGEST_MISMATCH",
      "transaction evidence bytes differ from S0 commitment"
    );
  }
  if (txEvidence.transition_commitment !== transition.transitionCommitment) {
    authorityFail("E2_RELEASE_TX_TRANSITION_MISMATCH", "transaction evidence transition mismatch");
  }

  const txHash = String(txEvidence.transaction_hash ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
    authorityFail("E2_RELEASE_TX_HASH_INVALID", "transaction evidence hash is invalid");
  }

  const [chainIdHex, tx, receipt] = await Promise.all([
    rpcCall(rpcUrl, "eth_chainId"),
    rpcCall(rpcUrl, "eth_getTransactionByHash", [txHash]),
    rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]),
  ]);
  if (!tx || !receipt) {
    authorityFail("E2_RELEASE_TX_NOT_OBSERVED", "matching transaction/receipt was not observed");
  }

  const committedTx = transition.envelope.transaction;
  const observedChainId = Number.parseInt(chainIdHex, 16);
  const observedFrom = lowerAddress(tx.from, "E2_RELEASE_TX_FROM_INVALID", "transaction from");
  const observedTo = lowerAddress(tx.to, "E2_RELEASE_TX_TO_INVALID", "transaction to");
  const observedInput = String(tx.input ?? "").toLowerCase();
  if (
    observedChainId !== committedTx.chain_id ||
    observedFrom !== committedTx.execution_account ||
    observedTo !== committedTx.target ||
    sha256Bytes(Buffer.from(observedInput.slice(2), "hex")) !== committedTx.calldata_sha256 ||
    BigInt(tx.value) !== BigInt(committedTx.native_value)
  ) {
    authorityFail("E2_RELEASE_TX_BINDING_MISMATCH", "chain readback differs from committed transaction");
  }
  if (
    String(receipt.transactionHash ?? "").toLowerCase() !== txHash ||
    !receiptSucceeded(receipt.status)
  ) {
    authorityFail("E2_RELEASE_RECEIPT_INVALID", "transaction receipt does not prove successful authorized tx");
  }

  const eventTopic = runCast(castBin, ["keccak", JOB_CREATED_SIGNATURE]);
  const target = committedTx.target;
  const provider = committedPayload.recipient;
  const matches = (receipt.logs ?? []).filter((log) => {
    const topics = Array.isArray(log?.topics) ? log.topics : [];
    return (
      String(log?.address ?? "").toLowerCase() === target &&
      String(topics[0] ?? "").toLowerCase() === eventTopic &&
      topics.length >= 4 &&
      topicAddress(topics[2], "E2_RELEASE_EVENT_CLIENT_INVALID", "event client") ===
        committedTx.execution_account &&
      topicAddress(topics[3], "E2_RELEASE_EVENT_PROVIDER_INVALID", "event provider") ===
        provider
    );
  });
  if (matches.length !== 1) {
    authorityFail(
      "E2_RELEASE_INSTANCE_BINDING_FAILED",
      "expected exactly one matching JobCreated event"
    );
  }

  const event = matches[0];
  const jobId = topicUint(event.topics[1], "E2_RELEASE_JOB_ID_INVALID", "job id");
  const instanceBinding = {
    schema: "workflow-observatory/instance-binding/v0",
    classification: "INSTANCE_DERIVED_FROM_MATCHING_EXECUTION",
    transition_commitment: transition.transitionCommitment,
    transaction_hash: txHash,
    target,
    job_created_event_topic: eventTopic,
    protected_client: committedTx.execution_account,
    provider,
    derived_job_id: jobId,
  };

  const released = authorityStateStore.releasePayload({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
    transitionCommitment: transition.transitionCommitment,
    enforcementDomain: warrant.enforcementDomain,
    payloadSha256: staged.payloadSha256,
  });
  if (released?.state !== "PAYLOAD_RELEASED") {
    authorityFail("E2_RELEASE_STATE_TRANSITION_FAILED", "S0 did not reach PAYLOAD_RELEASED");
  }

  let providerResponse;
  try {
    providerResponse = await fetch(providerUrl, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-paygod-payload-content-type": staged.payloadContentType,
        "x-paygod-provider": provider,
        "x-paygod-transition": transition.transitionCommitment,
        "x-paygod-job-id": jobId,
        "x-paygod-tx-hash": txHash,
      },
      body: staged.payloadBytes,
    });
  } catch (err) {
    authorityFail("E2_RELEASE_PROVIDER_DELIVERY_FAILED", "provider delivery failed after PAYLOAD_RELEASED", {
      cause: String(err?.message ?? err),
    });
  }
  if (!providerResponse.ok) {
    authorityFail(
      "E2_RELEASE_PROVIDER_REJECTED",
      "provider rejected delivery after PAYLOAD_RELEASED"
    );
  }

  const providerAck = await providerResponse.json();
  if (
    providerAck?.status !== "OBSERVED" ||
    providerAck?.observation?.payload_sha256 !== staged.payloadSha256 ||
    providerAck?.observation?.provider_identity !== provider ||
    providerAck?.observation?.transition_commitment !== transition.transitionCommitment ||
    providerAck?.observation?.derived_job_id !== jobId ||
    providerAck?.observation?.transaction_hash !== txHash
  ) {
    authorityFail("E2_RELEASE_PROVIDER_ACK_MISMATCH", "provider observation does not match release context");
  }

  return {
    status: "PAYLOAD_RELEASED",
    s0State: released.state,
    transitionCommitment: transition.transitionCommitment,
    warrantIssuerKeyId: warrant.issuerKeyId,
    warrantBodySha256: warrant.bodySha256,
    nonce: warrant.nonce,
    stagedPayloadSha256: staged.payloadSha256,
    releasedPayloadSha256: sha256Bytes(staged.payloadBytes),
    releasedPayloadByteLength: staged.payloadBytes.length,
    payloadRecipient: provider,
    payloadContentType: staged.payloadContentType,
    transactionHash: txHash,
    txEvidenceSha256,
    instanceBinding,
    providerObservation: providerAck.observation,
    exactStagedBytesReleased: true,
    clientSuppliedReleasePayloadAccepted: false,
    conformant: false,
  };
}

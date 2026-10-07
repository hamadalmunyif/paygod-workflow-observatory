import { authorityFail } from "./authority-error.mjs";
import { sha256Bytes } from "./digest.mjs";
import { parseExactTransitionEnvelopeV0 } from "./transition-envelope-v0.mjs";
import {
  CONTROLLED_ENFORCEMENT_DOMAIN,
  verifyWarrantV0,
} from "./warrant-v0.mjs";

function requireBytes(value, code, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  authorityFail(code, label + " must be explicit bytes or UTF-8 text");
}

function requireString(value, code, label) {
  if (typeof value !== "string" || value.length === 0) {
    authorityFail(code, label + " must be a non-empty string");
  }
  return value;
}

export function stagePayloadThroughE2V0({
  warrantBodyBytes,
  warrantSignatureBytes,
  trustedWarrantIssuers,
  transitionEnvelopeBytes,
  payloadBytes,
  payloadChannel,
  payloadRecipient,
  payloadContentType,
  authorityStateStore,
  expectedDomain = CONTROLLED_ENFORCEMENT_DOMAIN,
}) {
  if (
    !authorityStateStore ||
    typeof authorityStateStore.currentTimeMs !== "function" ||
    typeof authorityStateStore.stagePayloadExact !== "function"
  ) {
    authorityFail(
      "E2_S0_REQUIRED",
      "authorityStateStore with currentTimeMs/stagePayloadExact is required"
    );
  }

  const exactWarrantBodyBytes = requireBytes(
    warrantBodyBytes,
    "E2_WARRANT_BODY_REQUIRED",
    "warrantBodyBytes"
  );
  const exactWarrantSignatureBytes = requireBytes(
    warrantSignatureBytes,
    "E2_WARRANT_SIGNATURE_REQUIRED",
    "warrantSignatureBytes"
  );
  const exactEnvelopeBytes = requireBytes(
    transitionEnvelopeBytes,
    "E2_TRANSITION_ENVELOPE_REQUIRED",
    "transitionEnvelopeBytes"
  );
  const exactPayloadBytes = requireBytes(
    payloadBytes,
    "E2_PAYLOAD_BYTES_REQUIRED",
    "payloadBytes"
  );
  const actualChannel = requireString(
    payloadChannel,
    "E2_PAYLOAD_CHANNEL_REQUIRED",
    "payloadChannel"
  );
  const actualRecipient = requireString(
    payloadRecipient,
    "E2_PAYLOAD_RECIPIENT_REQUIRED",
    "payloadRecipient"
  );
  const actualContentType = requireString(
    payloadContentType,
    "E2_PAYLOAD_CONTENT_TYPE_REQUIRED",
    "payloadContentType"
  );

  const transition = parseExactTransitionEnvelopeV0(exactEnvelopeBytes);
  const nowMs = authorityStateStore.currentTimeMs();
  const warrant = verifyWarrantV0({
    bodyBytes: exactWarrantBodyBytes,
    signatureBytes: exactWarrantSignatureBytes,
    trustedIssuers: trustedWarrantIssuers,
    expectedDomain,
    expectedTransitionCommitment: transition.transitionCommitment,
    nowMs,
  });

  const expectedPayload = transition.envelope.payload;
  if (actualChannel !== expectedPayload.channel) {
    authorityFail(
      "E2_PAYLOAD_CHANNEL_MISMATCH",
      "actual payload channel differs from the committed transition"
    );
  }
  if (actualRecipient !== expectedPayload.recipient) {
    authorityFail(
      "E2_PAYLOAD_RECIPIENT_MISMATCH",
      "actual payload recipient differs from the committed transition"
    );
  }
  if (actualContentType !== expectedPayload.content_type) {
    authorityFail(
      "E2_PAYLOAD_CONTENT_TYPE_MISMATCH",
      "actual payload content type differs from the committed transition"
    );
  }

  const payloadSha256 = sha256Bytes(exactPayloadBytes);
  if (payloadSha256 !== expectedPayload.payload_sha256) {
    authorityFail(
      "E2_PAYLOAD_DIGEST_MISMATCH",
      "exact payload bytes differ from the committed transition"
    );
  }

  const staged = authorityStateStore.stagePayloadExact({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
    transitionCommitment: warrant.transitionCommitment,
    enforcementDomain: warrant.enforcementDomain,
    warrantBodySha256: warrant.bodySha256,
    payloadBytes: exactPayloadBytes,
    payloadChannel: actualChannel,
    payloadRecipient: actualRecipient,
    payloadContentType: actualContentType,
  });

  if (staged?.state?.state !== "PAYLOAD_STAGED") {
    authorityFail(
      "E2_STAGE_STATE_INVALID",
      "S0 did not return PAYLOAD_STAGED after exact-byte staging"
    );
  }
  if (
    staged?.stage?.payloadSha256 !== payloadSha256 ||
    !Buffer.isBuffer(staged?.stage?.payloadBytes) ||
    !staged.stage.payloadBytes.equals(exactPayloadBytes)
  ) {
    authorityFail(
      "E2_STAGE_EVIDENCE_MISMATCH",
      "S0 staged evidence does not match the exact accepted payload bytes"
    );
  }

  return {
    status: "PAYLOAD_STAGED",
    transitionCommitment: transition.transitionCommitment,
    warrantIssuerKeyId: warrant.issuerKeyId,
    warrantBodySha256: warrant.bodySha256,
    nonce: warrant.nonce,
    payloadSha256,
    payloadByteLength: exactPayloadBytes.length,
    payloadChannel: actualChannel,
    payloadRecipient: actualRecipient,
    payloadContentType: actualContentType,
    s0State: staged.state.state,
    providerDelivered: false,
    e1Executed: false,
    evmTransactionSubmitted: false,
  };
}

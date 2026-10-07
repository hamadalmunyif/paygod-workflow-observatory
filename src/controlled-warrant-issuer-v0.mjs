import { authorityFail } from "./authority-error.mjs";
import { sha256Bytes } from "./digest.mjs";
import { verifyTrustedControlledDecisionAdmissionV0 } from "./controlled-decision-admission-v0.mjs";
import {
  buildWarrantBodyV0,
  freshWarrantNonceV0,
  issuerKeyIdFromPublicKey,
  signWarrantBodyV0,
} from "./warrant-v0.mjs";

function asBytes(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  authorityFail("ISSUER_BYTES_REQUIRED", label + " must be explicit bytes or UTF-8 text");
}

function requireValidityMs(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    authorityFail(
      "ISSUER_VALIDITY_WINDOW_INVALID",
      "validityMs must be a positive safe integer"
    );
  }
  return value;
}

export function issueControlledWarrantFromTrustedDecisionV0({
  candidateBytes,
  requestShadow,
  transitionEnvelopeBytes,
  releaseProfile,
  paygodValidate,
  receiptBytes,
  paygodVerification,
  issuerPrivateKey,
  issuerPublicKey,
  authorityStateStore,
  validityMs = 60_000,
  nonceFactory = freshWarrantNonceV0,
}) {
  if (
    !authorityStateStore ||
    typeof authorityStateStore.currentTimeMs !== "function" ||
    typeof authorityStateStore.registerIssued !== "function"
  ) {
    authorityFail(
      "ISSUER_S0_REQUIRED",
      "authorityStateStore with currentTimeMs/registerIssued is required"
    );
  }
  if (typeof nonceFactory !== "function") {
    authorityFail("ISSUER_NONCE_FACTORY_INVALID", "nonceFactory must be a function");
  }

  const decision = verifyTrustedControlledDecisionAdmissionV0({
    candidateBytes,
    requestShadow,
    transitionEnvelopeBytes,
    releaseProfile,
    paygodValidate,
    receiptBytes,
    paygodVerification,
  });

  const duration = requireValidityMs(validityMs);
  const now = authorityStateStore.currentTimeMs();
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - duration) {
    authorityFail("ISSUER_TIME_INVALID", "S0 harness time cannot safely form the validity window");
  }

  const warrantIssuerKeyId = issuerKeyIdFromPublicKey(issuerPublicKey);
  if (warrantIssuerKeyId === decision.decisionIssuerKeyId) {
    authorityFail(
      "ISSUER_ROLE_KEY_COLLISION",
      "decision receipt signer and Warrant issuer must be distinct trust roles"
    );
  }

  const nonce = nonceFactory();
  const body = buildWarrantBodyV0({
    transitionCommitment: decision.transitionCommitment,
    notBefore: now,
    expiresAt: now + duration,
    nonce,
    issuerKeyId: warrantIssuerKeyId,
    enforcementDomain: decision.enforcementDomain,
  });

  const signed = signWarrantBodyV0({
    bodyBytes: body.bytes,
    privateKey: issuerPrivateKey,
    publicKey: issuerPublicKey,
  });

  const registered = authorityStateStore.registerIssued({
    issuerKeyId: warrantIssuerKeyId,
    nonce: body.body.nonce,
    transitionCommitment: body.body.transition_commitment,
    enforcementDomain: body.body.enforcement_domain,
    notBefore: body.body.not_before,
    expiresAt: body.body.expires_at,
    warrantBodySha256: body.bodySha256,
  });

  if (registered?.state !== "ISSUED") {
    authorityFail(
      "ISSUER_S0_REGISTRATION_FAILED",
      "S0 did not return ISSUED after Warrant registration"
    );
  }

  const exactCandidateBytes = asBytes(candidateBytes, "candidateBytes");
  const exactReceiptBytes = asBytes(receiptBytes, "receiptBytes");

  const audit = {
    schema: "workflow-observatory/warrant-issuance-audit/v0",
    decision_status: decision.status,
    decision_receipt_sha256: sha256Bytes(exactReceiptBytes),
    decision_canonical_input_hash: decision.canonicalInputHash,
    decision_issuer_key_id: decision.decisionIssuerKeyId,
    decision_replay: decision.decisionReplay,
    release_candidate_sha256: sha256Bytes(exactCandidateBytes),
    request_identity_sha256: decision.requestIdentitySha256,
    request_attempt_id: decision.attemptId,
    request_attempt_commitment_sha256: decision.attemptCommitmentSha256,
    transition_commitment: decision.transitionCommitment,
    enforcement_domain: decision.enforcementDomain,
    warrant_issuer_key_id: warrantIssuerKeyId,
    warrant_body_sha256: body.bodySha256,
    nonce: body.body.nonce,
    issued_at: now,
    expires_at: body.body.expires_at,
    s0_state: registered.state,
  };

  return {
    status: "ISSUED",
    decision,
    warrant: {
      body: body.body,
      bodyBytes: signed.bodyBytes,
      bodySha256: signed.bodySha256,
      signature: signed.signatureArtifact,
      signatureBytes: signed.signatureBytes,
    },
    state: registered,
    audit,
  };
}

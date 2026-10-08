import { authorityFail } from "./authority-error.mjs";
import { sha256Bytes } from "./digest.mjs";
import { verifyControlledReleaseCandidateV0 } from "./controlled-release-candidate-v0.mjs";
import { canonicalizePayGodJsonBytesV1 } from "./paygod-c14n-v1.mjs";

const SHA256_HEX = /^[0-9a-f]{64}$/;

function asBytes(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  authorityFail("DECISION_BYTES_REQUIRED", label + " must be explicit bytes or UTF-8 text");
}

function requireSha256(value, code, label) {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    authorityFail(code, label + " must be 64 lowercase hexadecimal characters");
  }
  return value;
}

function requireObject(value, code, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    authorityFail(code, label + " must be an object");
  }
  return value;
}

function parseJsonBytes(bytes, code, label) {
  const input = asBytes(bytes, label);
  let parsed;
  try {
    parsed = JSON.parse(input.toString("utf8"));
  } catch {
    authorityFail(code, label + " is not valid JSON");
  }
  return { input, parsed };
}

export function verifyControlledDecisionAdmissionV0({
  candidateBytes,
  requestShadow,
  transitionEnvelopeBytes,
  releaseProfile,
  paygodValidate,
  receiptBytes,
  paygodVerification,
}) {
  const profile = requireObject(
    releaseProfile,
    "DECISION_PROFILE_REQUIRED",
    "releaseProfile"
  );
  const validate = requireObject(
    paygodValidate,
    "DECISION_VALIDATE_RESULT_REQUIRED",
    "paygodValidate"
  );
  const verification = requireObject(
    paygodVerification,
    "DECISION_VERIFICATION_RESULT_REQUIRED",
    "paygodVerification"
  );

  const derived = verifyControlledReleaseCandidateV0({
    candidateBytes,
    requestShadow,
    transitionEnvelopeBytes,
  });

  const receipt = parseJsonBytes(
    receiptBytes,
    "DECISION_RECEIPT_JSON_INVALID",
    "receipt"
  );

  if (profile.schema !== "workflow-observatory/controlled-release-profile/v0") {
    authorityFail(
      "DECISION_PROFILE_SCHEMA_MISMATCH",
      "controlled release profile schema mismatch"
    );
  }
  if (profile.paygodKernelCommit !== "23ea2cca74ef8b698718c6d0c8dbda447f13bb37") {
    authorityFail(
      "DECISION_KERNEL_PIN_MISMATCH",
      "controlled release profile kernel commit mismatch"
    );
  }
  if (profile.enforcementDomain !== "controlled-harness/t0-v0") {
    authorityFail(
      "DECISION_DOMAIN_PROFILE_MISMATCH",
      "controlled release enforcement domain mismatch"
    );
  }
  if (profile.chainId !== 31337) {
    authorityFail(
      "DECISION_CHAIN_PROFILE_MISMATCH",
      "controlled release chain must remain 31337"
    );
  }
  if (profile.externalExecutionAuthorized !== false) {
    authorityFail(
      "DECISION_EXTERNAL_AUTHORITY_PROFILE_INVALID",
      "controlled release profile must keep external execution unauthorized"
    );
  }
  if (profile.paygodReceiptIssuerAuthenticityRequired !== true) {
    authorityFail(
      "DECISION_ISSUER_AUTH_NOT_REQUIRED",
      "controlled release profile must require receipt issuer authenticity"
    );
  }
  if (profile.paygodDecisionReplayPerformed !== false) {
    authorityFail(
      "DECISION_REPLAY_PROFILE_MISMATCH",
      "controlled release v0 must preserve replay=not_performed"
    );
  }

  if (validate.status !== "success") {
    authorityFail(
      "DECISION_CANONICAL_VALIDATE_FAILED",
      "PayGod canonical validate did not succeed"
    );
  }
  const canonicalInputHash = requireSha256(
    validate?.data?.hash,
    "DECISION_CANONICAL_INPUT_HASH_INVALID",
    "paygodValidate.data.hash"
  );

  const candidateCanonical = canonicalizePayGodJsonBytesV1(derived.bytes);
  if (candidateCanonical.hash !== canonicalInputHash) {
    authorityFail(
      "DECISION_VALIDATE_CANDIDATE_HASH_MISMATCH",
      "PayGod canonical validate hash does not match the exact current Release Candidate"
    );
  }

  if (verification.status !== "valid") {
    authorityFail(
      "DECISION_BUNDLE_INVALID",
      "PayGod evidence bundle verification status is not valid"
    );
  }
  if (verification.verifier_version !== profile.standaloneVerifierVersion) {
    authorityFail(
      "DECISION_VERIFIER_VERSION_MISMATCH",
      "standalone verifier version differs from the frozen profile"
    );
  }
  if (verification?.verification?.integrity !== "verified") {
    authorityFail(
      "DECISION_INTEGRITY_NOT_VERIFIED",
      "PayGod bundle integrity is not verified"
    );
  }
  if (verification?.verification?.issuer_authenticity !== "verified") {
    authorityFail(
      "DECISION_ISSUER_AUTH_NOT_VERIFIED",
      "PayGod receipt issuer authenticity is not verified"
    );
  }
  if (verification?.verification?.replay !== "not_performed") {
    authorityFail(
      "DECISION_REPLAY_STATE_MISMATCH",
      "decision replay state must remain not_performed in v0"
    );
  }
  if (
    verification?.issuer_signature?.key_trusted !== true ||
    verification?.issuer_signature?.signature_valid !== true ||
    verification?.issuer_signature?.receipt_sha256_matches !== true
  ) {
    authorityFail(
      "DECISION_ISSUER_SIGNATURE_INVALID",
      "PayGod receipt signature is not trusted, valid, and bound to the exact receipt"
    );
  }
  if (
    verification?.issuer_signature?.profile !==
    profile.paygodReceiptSignatureProfile
  ) {
    authorityFail(
      "DECISION_ISSUER_SIGNATURE_PROFILE_MISMATCH",
      "receipt signature profile differs from the frozen profile"
    );
  }
  if (verification?.issuer_signature?.algorithm !== "Ed25519") {
    authorityFail(
      "DECISION_ISSUER_SIGNATURE_ALGORITHM_MISMATCH",
      "receipt signature algorithm must be Ed25519"
    );
  }

  const receiptSha256 = sha256Bytes(receipt.input);
  if (verification.receipt_sha256 !== receiptSha256) {
    authorityFail(
      "DECISION_RECEIPT_DIGEST_MISMATCH",
      "verification result receipt digest differs from exact receipt bytes"
    );
  }

  if (receipt.parsed?.input?.canonical_hash !== candidateCanonical.hash) {
    authorityFail(
      "DECISION_RECEIPT_INPUT_HASH_MISMATCH",
      "receipt canonical input hash differs from the exact current Release Candidate"
    );
  }

  const pack = profile.pack ?? {};
  if (
    receipt.parsed?.pack?.name !== pack.name ||
    receipt.parsed?.pack?.version !== pack.version ||
    receipt.parsed?.pack?.digest_sha256 !== pack.digestSha256
  ) {
    authorityFail(
      "DECISION_PACK_CONTRACT_MISMATCH",
      "receipt pack identity differs from the frozen controlled release profile"
    );
  }
  if (
    receipt.parsed?.verdict?.value !== pack.allowedVerdict ||
    receipt.parsed?.verdict?.rule_name !== pack.allowedRule
  ) {
    authorityFail(
      "DECISION_VERDICT_CONTRACT_MISMATCH",
      "receipt verdict/rule differs from the frozen controlled release contract"
    );
  }

  const candidate = derived.candidate;
  if (candidate.authority.enforcement_domain !== profile.enforcementDomain) {
    authorityFail(
      "DECISION_CANDIDATE_DOMAIN_MISMATCH",
      "release candidate enforcement domain differs from the frozen profile"
    );
  }
  if (candidate.transition.chain_id !== profile.chainId) {
    authorityFail(
      "DECISION_CANDIDATE_CHAIN_MISMATCH",
      "release candidate chain differs from the frozen profile"
    );
  }
  if (
    candidate.authority.external_execution_authorized !==
    profile.externalExecutionAuthorized
  ) {
    authorityFail(
      "DECISION_CANDIDATE_AUTHORITY_MISMATCH",
      "release candidate external authority differs from the frozen profile"
    );
  }

  const decisionIssuerKeyId = verification?.issuer_signature?.key_id;
  if (typeof decisionIssuerKeyId !== "string" || decisionIssuerKeyId.length === 0) {
    authorityFail(
      "DECISION_ISSUER_KEY_ID_REQUIRED",
      "verified decision issuer key id is required"
    );
  }

  return {
    status: "AUTHENTICATED_CANONICAL_ALLOW",
    canonicalInputHash,
    candidateCanonicalHash: candidateCanonical.hash,
    candidateCanonicalProfile: candidateCanonical.profile,
    receiptSha256,
    decisionIssuerKeyId,
    decisionReplay: "not_performed",
    transitionCommitment: derived.transitionCommitment,
    requestIdentitySha256:
      candidate.request.admitted_request_identity_sha256,
    requestPayloadSha256: candidate.request.request_payload_sha256,
    attemptId: candidate.request.attempt_id,
    attemptCommitmentSha256:
      candidate.request.attempt_commitment_sha256,
    enforcementDomain: candidate.authority.enforcement_domain,
    chainId: candidate.transition.chain_id,
    packDigestSha256: pack.digestSha256,
    verdict: pack.allowedVerdict,
    ruleName: pack.allowedRule,
  };
}

import { authorityFail } from "./authority-error.mjs";
import { sha256Bytes } from "./digest.mjs";
import { parseExactTransitionEnvelopeV0 } from "./transition-envelope-v0.mjs";

export const CONTROLLED_RELEASE_CANDIDATE_KIND =
  "paygod-controlled-release-candidate";
export const CONTROLLED_RELEASE_CANDIDATE_PROFILE =
  "controlled-harness/release-candidate/v0";
export const CONTROLLED_RELEASE_DOMAIN = "controlled-harness/t0-v0";
export const ADMISSION_PACK_NAME = "acp-request-admission-shadow";
export const ADMISSION_PACK_VERSION = "0.2.0";
export const ADMISSION_ALLOWED_VERDICT = "allow";
export const ADMISSION_ALLOWED_RULE = "shadow-admitted";

const SHA256_HEX = /^[0-9a-f]{64}$/;

function asBuffer(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  authorityFail("RELEASE_BYTES_REQUIRED", label + " must be explicit bytes or UTF-8 text");
}

function requireSha256(value, code, label) {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    authorityFail(code, label + " must be 64 lowercase hexadecimal characters");
  }
  return value;
}

function requireNonEmptyString(value, code, label) {
  if (typeof value !== "string" || value.length === 0) {
    authorityFail(code, label + " must be a non-empty string");
  }
  return value;
}

export function parseAdmissionReceiptV0(admissionReceiptBytes) {
  const bytes = asBuffer(admissionReceiptBytes, "admission receipt");
  let receipt;
  try {
    receipt = JSON.parse(bytes.toString("utf8"));
  } catch {
    authorityFail(
      "RELEASE_ADMISSION_RECEIPT_JSON_INVALID",
      "admission receipt must be valid JSON"
    );
  }

  if (receipt?.api_version !== "paygod/v1" || receipt?.kind !== "Receipt") {
    authorityFail(
      "RELEASE_ADMISSION_RECEIPT_CONTRACT_MISMATCH",
      "admission receipt must be a paygod/v1 Receipt"
    );
  }
  if (
    receipt?.pack?.name !== ADMISSION_PACK_NAME ||
    receipt?.pack?.version !== ADMISSION_PACK_VERSION
  ) {
    authorityFail(
      "RELEASE_ADMISSION_PACK_MISMATCH",
      "admission receipt must come from the frozen admission pack"
    );
  }
  const packDigestSha256 = requireSha256(
    receipt?.pack?.digest_sha256,
    "RELEASE_ADMISSION_PACK_DIGEST_INVALID",
    "admission receipt pack.digest_sha256"
  );
  const inputCanonicalHash = requireSha256(
    receipt?.input?.canonical_hash,
    "RELEASE_ADMISSION_INPUT_HASH_INVALID",
    "admission receipt input.canonical_hash"
  );
  if (
    receipt?.verdict?.value !== ADMISSION_ALLOWED_VERDICT ||
    receipt?.verdict?.rule_name !== ADMISSION_ALLOWED_RULE
  ) {
    authorityFail(
      "RELEASE_ADMISSION_VERDICT_MISMATCH",
      "admission receipt must be allow/shadow-admitted"
    );
  }

  return {
    receipt,
    bytes,
    receiptSha256: sha256Bytes(bytes),
    packDigestSha256,
    inputCanonicalHash,
  };
}

export function buildControlledReleaseCandidateV0({
  requestShadow,
  transitionEnvelopeBytes,
  admissionReceiptBytes,
}) {
  if (requestShadow?.kind !== "acp-request-shadow") {
    authorityFail(
      "RELEASE_REQUEST_SHADOW_KIND_MISMATCH",
      "request shadow kind must be acp-request-shadow"
    );
  }
  if (requestShadow?.mode !== "shadow-only") {
    authorityFail(
      "RELEASE_REQUEST_SHADOW_MODE_MISMATCH",
      "request shadow must remain shadow-only"
    );
  }
  if (requestShadow?.request?.status !== "CANDIDATE_LOCAL_VALIDATED") {
    authorityFail(
      "RELEASE_REQUEST_NOT_ADMITTED",
      "request status must be CANDIDATE_LOCAL_VALIDATED"
    );
  }
  if (requestShadow?.request?.schemaValidation !== "LOCAL_VALIDATED") {
    authorityFail(
      "RELEASE_REQUEST_SCHEMA_NOT_VALIDATED",
      "request schemaValidation must be LOCAL_VALIDATED"
    );
  }

  const admittedIdentity = requireSha256(
    requestShadow?.request?.admittedRequestIdentitySha256,
    "RELEASE_REQUEST_IDENTITY_INVALID",
    "admittedRequestIdentitySha256"
  );
  const requestPayloadSha256 = requireSha256(
    requestShadow?.request?.requestPayloadArtifactSha256,
    "RELEASE_REQUEST_PAYLOAD_DIGEST_INVALID",
    "requestPayloadArtifactSha256"
  );
  const attemptId = requireNonEmptyString(
    requestShadow?.request?.attemptId,
    "RELEASE_ATTEMPT_ID_REQUIRED",
    "attemptId"
  );
  const attemptCommitmentSha256 = requireSha256(
    requestShadow?.request?.attemptCommitmentSha256,
    "RELEASE_ATTEMPT_COMMITMENT_INVALID",
    "attemptCommitmentSha256"
  );

  if (
    requestShadow?.authority?.acpJobCreationAuthorized !== false ||
    requestShadow?.authority?.acpFundingAuthorized !== false ||
    requestShadow?.authority?.acpSigningAuthorized !== false ||
    requestShadow?.authority?.acpExecutionAuthorized !== false
  ) {
    authorityFail(
      "RELEASE_SOURCE_AUTHORITY_UPGRADE",
      "request shadow must not claim ACP execution authority"
    );
  }

  const admission = parseAdmissionReceiptV0(admissionReceiptBytes);
  const transition = parseExactTransitionEnvelopeV0(transitionEnvelopeBytes);

  if (transition.envelope.request_identity_sha256 !== admittedIdentity) {
    authorityFail(
      "RELEASE_REQUEST_TRANSITION_IDENTITY_MISMATCH",
      "transition request identity differs from the admitted request identity"
    );
  }
  if (transition.envelope.payload.payload_sha256 !== requestPayloadSha256) {
    authorityFail(
      "RELEASE_REQUEST_PAYLOAD_MISMATCH",
      "transition payload digest differs from the frozen request payload digest"
    );
  }
  if (
    transition.envelope.transaction.system !== "evm" ||
    transition.envelope.transaction.chain_id !== 31337
  ) {
    authorityFail(
      "RELEASE_TRANSITION_NOT_LOCAL",
      "controlled release v0 requires local EVM chain 31337"
    );
  }

  const candidate = {
    kind: CONTROLLED_RELEASE_CANDIDATE_KIND,
    profile: CONTROLLED_RELEASE_CANDIDATE_PROFILE,
    admission: {
      receipt_sha256: admission.receiptSha256,
      input_canonical_hash: admission.inputCanonicalHash,
      pack_name: admission.receipt.pack.name,
      pack_version: admission.receipt.pack.version,
      pack_digest_sha256: admission.packDigestSha256,
      verdict: admission.receipt.verdict.value,
      rule: admission.receipt.verdict.rule_name,
    },
    request: {
      status: requestShadow.request.status,
      schema_validation: requestShadow.request.schemaValidation,
      admitted_request_identity_sha256: admittedIdentity,
      request_payload_sha256: requestPayloadSha256,
      attempt_id: attemptId,
      attempt_commitment_sha256: attemptCommitmentSha256,
    },
    transition: {
      schema: transition.envelope.schema,
      request_identity_sha256: transition.envelope.request_identity_sha256,
      transition_commitment: transition.transitionCommitment,
      system: transition.envelope.transaction.system,
      chain_id: transition.envelope.transaction.chain_id,
      execution_account: transition.envelope.transaction.execution_account,
      target: transition.envelope.transaction.target,
      calldata_sha256: transition.envelope.transaction.calldata_sha256,
      native_value: transition.envelope.transaction.native_value,
      payload: {
        channel: transition.envelope.payload.channel,
        recipient: transition.envelope.payload.recipient,
        content_type: transition.envelope.payload.content_type,
        payload_sha256: transition.envelope.payload.payload_sha256,
      },
    },
    authority: {
      enforcement_domain: CONTROLLED_RELEASE_DOMAIN,
      local_only: true,
      external_execution_authorized: false,
    },
  };

  const bytes = Buffer.from(JSON.stringify(candidate), "utf8");
  return {
    candidate,
    bytes,
    transitionCommitment: transition.transitionCommitment,
    admittedRequestIdentitySha256: admittedIdentity,
    admissionReceiptSha256: admission.receiptSha256,
  };
}

export function verifyControlledReleaseCandidateV0({
  candidateBytes,
  requestShadow,
  transitionEnvelopeBytes,
  admissionReceiptBytes,
}) {
  const input = asBuffer(candidateBytes, "release candidate");

  let parsed;
  try {
    parsed = JSON.parse(input.toString("utf8"));
  } catch {
    authorityFail(
      "RELEASE_CANDIDATE_JSON_INVALID",
      "release candidate is not valid JSON"
    );
  }

  if (parsed?.kind !== CONTROLLED_RELEASE_CANDIDATE_KIND) {
    authorityFail(
      "RELEASE_CANDIDATE_KIND_MISMATCH",
      "release candidate kind does not match v0"
    );
  }
  if (parsed?.profile !== CONTROLLED_RELEASE_CANDIDATE_PROFILE) {
    authorityFail(
      "RELEASE_CANDIDATE_PROFILE_MISMATCH",
      "release candidate profile does not match v0"
    );
  }

  const expected = buildControlledReleaseCandidateV0({
    requestShadow,
    transitionEnvelopeBytes,
    admissionReceiptBytes,
  });

  if (!expected.bytes.equals(input)) {
    authorityFail(
      "RELEASE_CANDIDATE_DERIVATION_MISMATCH",
      "release candidate bytes are not the exact v0 derivation of the admitted request, D1 receipt, and frozen transition envelope"
    );
  }

  return {
    status: "VERIFIED",
    candidate: expected.candidate,
    bytes: expected.bytes,
    transitionCommitment: expected.transitionCommitment,
    admittedRequestIdentitySha256: expected.admittedRequestIdentitySha256,
    admissionReceiptSha256: expected.admissionReceiptSha256,
  };
}

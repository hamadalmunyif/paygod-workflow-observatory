import { authorityFail } from "./authority-error.mjs";
import { sha256Bytes } from "./digest.mjs";
import {
  parseAdmissionReceiptV0,
  verifyControlledReleaseCandidateV0,
} from "./controlled-release-candidate-v0.mjs";

const SHA256_HEX = /^[0-9a-f]{64}$/;
const PROFILE_SCHEMA = "workflow-observatory/controlled-release-profile/v0";

function asBuffer(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  authorityFail("DECISION_CHAIN_BYTES_REQUIRED", label + " must be bytes or UTF-8 text");
}

function requireSha256(value, code, label) {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    authorityFail(code, label + " must be 64 lowercase hexadecimal characters");
  }
  return value;
}

function requireProfilePack(pack, label) {
  if (!pack || typeof pack !== "object") {
    authorityFail("DECISION_CHAIN_PROFILE_INVALID", label + " profile is missing");
  }
  for (const key of ["path", "name", "version", "allowedVerdict", "allowedRule"]) {
    if (typeof pack[key] !== "string" || pack[key].length === 0) {
      authorityFail(
        "DECISION_CHAIN_PROFILE_INVALID",
        label + "." + key + " must be a non-empty string"
      );
    }
  }
  requireSha256(
    pack.digestSha256,
    "DECISION_CHAIN_PROFILE_DIGEST_UNPINNED",
    label + ".digestSha256"
  );
}

function verifyDecisionAuthProfile(profile) {
  if (profile.paygodReceiptIssuerAuthenticityRequired !== true) {
    authorityFail(
      "DECISION_CHAIN_AUTHENTICITY_PROFILE_INVALID",
      "authenticated decision-chain v0 requires receipt issuer authenticity"
    );
  }
  if (profile.paygodReceiptSignatureProfile !== "paygod-ed25519-receipt-v1") {
    authorityFail(
      "DECISION_CHAIN_SIGNATURE_PROFILE_MISMATCH",
      "unexpected PayGod receipt signature profile"
    );
  }
  if (profile.paygodReceiptTrustProfile !== "paygod-ed25519-trust-v1") {
    authorityFail(
      "DECISION_CHAIN_TRUST_PROFILE_MISMATCH",
      "unexpected PayGod receipt trust profile"
    );
  }
  if (profile.paygodDecisionIssuerKeyScope !== "ephemeral-controlled-harness-epoch") {
    authorityFail(
      "DECISION_CHAIN_ISSUER_SCOPE_MISMATCH",
      "unexpected controlled decision issuer key scope"
    );
  }
  if (profile.decisionChainRequiresSameIssuerKey !== true) {
    authorityFail(
      "DECISION_CHAIN_SAME_ISSUER_NOT_REQUIRED",
      "D1 and D2 must require the same controlled decision issuer key"
    );
  }
}

function parseReceipt(bytes, codePrefix) {
  const input = asBuffer(bytes, codePrefix + " receipt");
  let receipt;
  try {
    receipt = JSON.parse(input.toString("utf8"));
  } catch {
    authorityFail(codePrefix + "_RECEIPT_JSON_INVALID", codePrefix + " receipt is not valid JSON");
  }
  if (receipt?.api_version !== "paygod/v1" || receipt?.kind !== "Receipt") {
    authorityFail(
      codePrefix + "_RECEIPT_CONTRACT_MISMATCH",
      codePrefix + " receipt must be a paygod/v1 Receipt"
    );
  }
  requireSha256(
    receipt?.pack?.digest_sha256,
    codePrefix + "_PACK_DIGEST_INVALID",
    codePrefix + " receipt pack.digest_sha256"
  );
  requireSha256(
    receipt?.input?.canonical_hash,
    codePrefix + "_INPUT_HASH_INVALID",
    codePrefix + " receipt input.canonical_hash"
  );
  return {
    receipt,
    bytes: input,
    receiptSha256: sha256Bytes(input),
  };
}

function verifyPortableResult(result, codePrefix, profile, expectedReceiptSha256) {
  if (!result || typeof result !== "object") {
    authorityFail(codePrefix + "_VERIFICATION_MISSING", codePrefix + " verification result is missing");
  }
  if (
    result.status !== "valid" ||
    result?.verification?.integrity !== "verified"
  ) {
    authorityFail(
      codePrefix + "_INTEGRITY_NOT_VERIFIED",
      codePrefix + " portable bundle integrity must be verified"
    );
  }
  if (result.verifier_version !== profile.standaloneVerifierVersion) {
    authorityFail(
      codePrefix + "_VERIFIER_VERSION_MISMATCH",
      codePrefix + " verifier version differs from the frozen profile"
    );
  }
  if (profile.paygodReceiptIssuerAuthenticityRequired === true) {
    if (result?.verification?.issuer_authenticity !== "verified") {
      authorityFail(
        codePrefix + "_AUTHENTICITY_NOT_VERIFIED",
        codePrefix + " receipt issuer authenticity must be verified"
      );
    }
    if (
      result?.issuer_signature?.present !== true ||
      result?.issuer_signature?.key_trusted !== true ||
      result?.issuer_signature?.signature_valid !== true ||
      result?.issuer_signature?.receipt_sha256_matches !== true
    ) {
      authorityFail(
        codePrefix + "_ISSUER_SIGNATURE_INVALID",
        codePrefix + " receipt signature must be present, trusted, valid, and bound to exact receipt bytes"
      );
    }
    if (
      result?.issuer_signature?.profile !== profile.paygodReceiptSignatureProfile ||
      result?.issuer_signature?.algorithm !== "Ed25519"
    ) {
      authorityFail(
        codePrefix + "_ISSUER_SIGNATURE_PROFILE_MISMATCH",
        codePrefix + " receipt signature profile/algorithm differs from frozen profile"
      );
    }
    if (
      typeof result?.issuer_signature?.key_id !== "string" ||
      result.issuer_signature.key_id.length === 0
    ) {
      authorityFail(
        codePrefix + "_ISSUER_KEY_ID_REQUIRED",
        codePrefix + " verified decision issuer key id is required"
      );
    }
    if (result.receipt_sha256 !== expectedReceiptSha256) {
      authorityFail(
        codePrefix + "_VERIFIED_RECEIPT_DIGEST_MISMATCH",
        codePrefix + " verifier result is not bound to the exact receipt bytes"
      );
    }
  } else {
    authorityFail(
      codePrefix + "_AUTHENTICITY_PROFILE_NOT_REQUIRED",
      "authenticated decision-chain v0 requires receipt issuer authenticity"
    );
  }
  if (profile.paygodDecisionReplayPerformed === false) {
    if (result?.verification?.replay !== "not_performed") {
      authorityFail(
        codePrefix + "_REPLAY_STATE_MISMATCH",
        codePrefix + " replay state must remain not_performed in v0"
      );
    }
  }
}

function verifyPackContract(receipt, packProfile, codePrefix) {
  if (
    receipt?.pack?.name !== packProfile.name ||
    receipt?.pack?.version !== packProfile.version
  ) {
    authorityFail(
      codePrefix + "_PACK_IDENTITY_MISMATCH",
      codePrefix + " receipt pack name/version differs from frozen profile"
    );
  }
  if (receipt.pack.digest_sha256 !== packProfile.digestSha256) {
    authorityFail(
      codePrefix + "_PACK_DIGEST_MISMATCH",
      codePrefix + " receipt pack digest differs from frozen profile"
    );
  }
  if (
    receipt?.verdict?.value !== packProfile.allowedVerdict ||
    receipt?.verdict?.rule_name !== packProfile.allowedRule
  ) {
    authorityFail(
      codePrefix + "_VERDICT_MISMATCH",
      codePrefix + " receipt verdict/rule differs from frozen profile"
    );
  }
}

export function verifyAdmissionDecisionV0({
  requestShadowCanonicalHash,
  admissionReceiptBytes,
  admissionVerification,
  profile,
}) {
  if (profile?.schema !== PROFILE_SCHEMA) {
    authorityFail(
      "DECISION_CHAIN_PROFILE_SCHEMA_MISMATCH",
      "controlled release profile schema is not v0"
    );
  }
  requireProfilePack(profile.admissionPack, "admissionPack");
  verifyDecisionAuthProfile(profile);
  requireSha256(
    requestShadowCanonicalHash,
    "DECISION_CHAIN_D1_CANONICAL_HASH_INVALID",
    "requestShadowCanonicalHash"
  );

  const d1 = parseAdmissionReceiptV0(admissionReceiptBytes);
  verifyPackContract(d1.receipt, profile.admissionPack, "DECISION_CHAIN_D1");
  verifyPortableResult(
    admissionVerification,
    "DECISION_CHAIN_D1",
    profile,
    d1.receiptSha256
  );

  if (d1.inputCanonicalHash !== requestShadowCanonicalHash) {
    authorityFail(
      "DECISION_CHAIN_D1_INPUT_HASH_MISMATCH",
      "D1 receipt input hash differs from canonical Kernel validation of request-shadow"
    );
  }

  return {
    status: "ADMISSION_DECISION_VERIFIED",
    receipt: d1.receipt,
    receiptBytes: d1.bytes,
    receiptSha256: d1.receiptSha256,
    inputCanonicalHash: d1.inputCanonicalHash,
    packDigestSha256: d1.packDigestSha256,
    verdict: d1.receipt.verdict.value,
    rule: d1.receipt.verdict.rule_name,
    integrity: admissionVerification.verification.integrity,
    issuerAuthenticity: admissionVerification.verification.issuer_authenticity,
    replay: admissionVerification.verification.replay,
    decisionIssuerKeyId: admissionVerification.issuer_signature.key_id,
  };
}

export function verifyReleaseDecisionChainV0({
  requestShadow,
  requestShadowCanonicalHash,
  admissionReceiptBytes,
  admissionVerification,
  transitionEnvelopeBytes,
  releaseCandidateBytes,
  releaseCandidateCanonicalHash,
  releaseReceiptBytes,
  releaseVerification,
  profile,
}) {
  if (profile?.schema !== PROFILE_SCHEMA) {
    authorityFail(
      "DECISION_CHAIN_PROFILE_SCHEMA_MISMATCH",
      "controlled release profile schema is not v0"
    );
  }
  requireProfilePack(profile.admissionPack, "admissionPack");
  requireProfilePack(profile.pack, "pack");
  if (profile.enforcementDomain !== "controlled-harness/t0-v0") {
    authorityFail(
      "DECISION_CHAIN_DOMAIN_PROFILE_MISMATCH",
      "profile enforcement domain must be controlled-harness/t0-v0"
    );
  }
  if (profile.chainId !== 31337) {
    authorityFail(
      "DECISION_CHAIN_CHAIN_PROFILE_MISMATCH",
      "profile chain id must be 31337"
    );
  }

  requireSha256(
    releaseCandidateCanonicalHash,
    "DECISION_CHAIN_D2_CANONICAL_HASH_INVALID",
    "releaseCandidateCanonicalHash"
  );

  const d1 = verifyAdmissionDecisionV0({
    requestShadowCanonicalHash,
    admissionReceiptBytes,
    admissionVerification,
    profile,
  });

  const candidate = verifyControlledReleaseCandidateV0({
    candidateBytes: releaseCandidateBytes,
    requestShadow,
    transitionEnvelopeBytes,
    admissionReceiptBytes: d1.receiptBytes,
  });

  if (
    candidate.candidate.admission.receipt_sha256 !== d1.receiptSha256 ||
    candidate.candidate.admission.input_canonical_hash !== d1.inputCanonicalHash ||
    candidate.candidate.admission.pack_digest_sha256 !== d1.packDigestSha256
  ) {
    authorityFail(
      "DECISION_CHAIN_D1_CANDIDATE_LINK_MISMATCH",
      "release candidate does not commit the exact verified D1 receipt"
    );
  }

  if (candidate.candidate.authority.enforcement_domain !== profile.enforcementDomain) {
    authorityFail(
      "DECISION_CHAIN_DOMAIN_MISMATCH",
      "release candidate enforcement domain differs from frozen profile"
    );
  }
  if (candidate.candidate.transition.chain_id !== profile.chainId) {
    authorityFail(
      "DECISION_CHAIN_CHAIN_MISMATCH",
      "release candidate chain id differs from frozen profile"
    );
  }
  if (candidate.candidate.authority.external_execution_authorized !== false) {
    authorityFail(
      "DECISION_CHAIN_EXTERNAL_AUTHORITY_UPGRADE",
      "release candidate must keep external execution unauthorized"
    );
  }

  const d2 = parseReceipt(releaseReceiptBytes, "DECISION_CHAIN_D2");
  verifyPackContract(d2.receipt, profile.pack, "DECISION_CHAIN_D2");
  verifyPortableResult(
    releaseVerification,
    "DECISION_CHAIN_D2",
    profile,
    d2.receiptSha256
  );

  if (d1.decisionIssuerKeyId !== releaseVerification.issuer_signature.key_id) {
    authorityFail(
      "DECISION_CHAIN_DECISION_ISSUER_EPOCH_MISMATCH",
      "D1 and D2 receipts must authenticate to the same controlled decision issuer key for the harness epoch"
    );
  }

  if (d2.receipt.input.canonical_hash !== releaseCandidateCanonicalHash) {
    authorityFail(
      "DECISION_CHAIN_D2_INPUT_HASH_MISMATCH",
      "D2 receipt input hash differs from canonical Kernel validation of release candidate"
    );
  }

  return {
    status: "DECISION_CHAIN_VERIFIED",
    kernelCommit: profile.paygodKernelCommit,
    d1: {
      receiptSha256: d1.receiptSha256,
      inputCanonicalHash: d1.inputCanonicalHash,
      packDigestSha256: d1.packDigestSha256,
      verdict: d1.verdict,
      rule: d1.rule,
      integrity: d1.integrity,
      issuerAuthenticity: d1.issuerAuthenticity,
      replay: d1.replay,
      decisionIssuerKeyId: d1.decisionIssuerKeyId,
    },
    d2: {
      receiptSha256: d2.receiptSha256,
      inputCanonicalHash: d2.receipt.input.canonical_hash,
      packDigestSha256: d2.receipt.pack.digest_sha256,
      verdict: d2.receipt.verdict.value,
      rule: d2.receipt.verdict.rule_name,
      integrity: releaseVerification.verification.integrity,
      issuerAuthenticity: releaseVerification.verification.issuer_authenticity,
      replay: releaseVerification.verification.replay,
      decisionIssuerKeyId: releaseVerification.issuer_signature.key_id,
    },
    requestIdentity: candidate.admittedRequestIdentitySha256,
    attemptId: candidate.candidate.request.attempt_id,
    attemptCommitmentSha256:
      candidate.candidate.request.attempt_commitment_sha256,
    transitionCommitment: candidate.transitionCommitment,
    enforcementDomain: candidate.candidate.authority.enforcement_domain,
    chainId: candidate.candidate.transition.chain_id,
    externalExecutionAuthorized: false,
  };
}

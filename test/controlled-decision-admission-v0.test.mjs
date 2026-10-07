import test from "node:test";
import assert from "node:assert/strict";

import { AuthorityError } from "../src/authority-error.mjs";
import { sha256Bytes } from "../src/digest.mjs";
import { buildTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";
import { buildControlledReleaseCandidateV0 } from "../src/controlled-release-candidate-v0.mjs";
import { verifyTrustedControlledDecisionAdmissionV0 } from "../src/controlled-decision-admission-v0.mjs";

const identity = "11".repeat(32);
const payloadDigest = "22".repeat(32);
const attemptCommitment = "33".repeat(32);
const canonicalHash = "44".repeat(32);
const packDigest = "ea21e54e165c90418a6d4a903108441fa6d7c0e2c425adc14c0f62a430b9dc7b";

function expectCode(fn, code) {
  assert.throws(
    fn,
    (err) => err instanceof AuthorityError && err.code === code
  );
}

function requestShadow() {
  return {
    kind: "acp-request-shadow",
    mode: "shadow-only",
    request: {
      status: "CANDIDATE_LOCAL_VALIDATED",
      schemaValidation: "LOCAL_VALIDATED",
      admittedRequestIdentitySha256: identity,
      requestPayloadArtifactSha256: payloadDigest,
      attemptId: "attempt-1",
      attemptCommitmentSha256: attemptCommitment,
    },
    authority: {
      acpJobCreationAuthorized: false,
      acpFundingAuthorized: false,
      acpSigningAuthorized: false,
      acpExecutionAuthorized: false,
    },
  };
}

function transition() {
  return buildTransitionEnvelopeV0({
    requestIdentitySha256: identity,
    transaction: {
      system: "evm",
      chainId: 31337,
      executionAccount: "0x" + "55".repeat(20),
      target: "0x" + "66".repeat(20),
      calldataSha256: "77".repeat(32),
      nativeValue: "0",
    },
    payload: {
      channel: "controlled-requirement-message/v0",
      recipient: "0x" + "88".repeat(20),
      contentType: "requirement",
      payloadSha256: payloadDigest,
    },
  });
}

function releaseProfile() {
  return {
    schema: "workflow-observatory/controlled-release-profile/v0",
    paygodKernelCommit: "23ea2cca74ef8b698718c6d0c8dbda447f13bb37",
    standaloneVerifierVersion: "0.4.0",
    pack: {
      path: "packs/controlled-authority-release-v0",
      name: "controlled-authority-release-v0",
      version: "0.1.0",
      digestSha256: packDigest,
      allowedVerdict: "allow",
      allowedRule: "controlled-local-release",
    },
    enforcementDomain: "controlled-harness/t0-v0",
    chainId: 31337,
    paygodReceiptIssuerAuthenticityRequired: true,
    paygodReceiptSignatureProfile: "paygod-ed25519-receipt-v1",
    paygodReceiptTrustProfile: "paygod-ed25519-trust-v1",
    paygodDecisionIssuerKeyScope: "ephemeral-controlled-harness-epoch",
    paygodDecisionReplayPerformed: false,
    externalExecutionAuthorized: false,
  };
}

function baseline() {
  const shadow = requestShadow();
  const tx = transition();
  const candidate = buildControlledReleaseCandidateV0({
    requestShadow: shadow,
    transitionEnvelopeBytes: tx.bytes,
  });
  const receiptObject = {
    input: { canonical_hash: canonicalHash },
    pack: {
      name: "controlled-authority-release-v0",
      version: "0.1.0",
      digest_sha256: packDigest,
    },
    verdict: {
      value: "allow",
      rule_name: "controlled-local-release",
    },
  };
  const receiptBytes = Buffer.from(JSON.stringify(receiptObject), "utf8");
  const verification = {
    status: "valid",
    verifier_version: "0.4.0",
    receipt_sha256: sha256Bytes(receiptBytes),
    verification: {
      integrity: "verified",
      issuer_authenticity: "verified",
      replay: "not_performed",
      time_authority: "producer_supplied",
    },
    issuer_signature: {
      present: true,
      profile: "paygod-ed25519-receipt-v1",
      algorithm: "Ed25519",
      key_id: "controlled-decision-ed25519:test",
      receipt_sha256_matches: true,
      key_trusted: true,
      signature_valid: true,
      reason: "verified",
    },
  };

  return {
    shadow,
    tx,
    candidate,
    profile: releaseProfile(),
    validate: { status: "success", data: { hash: canonicalHash } },
    receiptBytes,
    verification,
  };
}

function admit(overrides = {}) {
  const x = baseline();
  return verifyTrustedControlledDecisionAdmissionV0({
    candidateBytes: overrides.candidateBytes ?? x.candidate.bytes,
    requestShadow: overrides.requestShadow ?? x.shadow,
    transitionEnvelopeBytes: overrides.transitionEnvelopeBytes ?? x.tx.bytes,
    releaseProfile: overrides.releaseProfile ?? x.profile,
    paygodValidate: overrides.paygodValidate ?? x.validate,
    receiptBytes: overrides.receiptBytes ?? x.receiptBytes,
    paygodVerification: overrides.paygodVerification ?? x.verification,
  });
}

test("authenticated canonical decision is admitted with request and attempt bindings", () => {
  const result = admit();
  assert.equal(result.status, "AUTHENTICATED_CANONICAL_ALLOW");
  assert.equal(result.requestIdentitySha256, identity);
  assert.equal(result.attemptId, "attempt-1");
  assert.equal(result.attemptCommitmentSha256, attemptCommitment);
  assert.equal(result.decisionReplay, "not_performed");
  assert.equal(result.packDigestSha256, packDigest);
});

test("A44 unsigned decision receipt is rejected", () => {
  const x = baseline();
  expectCode(
    () =>
      admit({
        paygodVerification: {
          ...x.verification,
          verification: {
            ...x.verification.verification,
            issuer_authenticity: "not_verified",
          },
        },
      }),
    "DECISION_ISSUER_AUTH_NOT_VERIFIED"
  );
});

test("A45 untrusted decision signer is rejected", () => {
  const x = baseline();
  expectCode(
    () =>
      admit({
        paygodVerification: {
          ...x.verification,
          issuer_signature: {
            ...x.verification.issuer_signature,
            key_trusted: false,
          },
        },
      }),
    "DECISION_ISSUER_SIGNATURE_INVALID"
  );
});

test("A46 receipt mutation after signature is rejected", () => {
  const x = baseline();
  const mutated = JSON.parse(x.receiptBytes.toString("utf8"));
  mutated.verdict.rule_name = "mutated-rule";
  expectCode(
    () =>
      admit({
        receiptBytes: Buffer.from(JSON.stringify(mutated), "utf8"),
      }),
    "DECISION_RECEIPT_DIGEST_MISMATCH"
  );
});

test("A47 candidate / receipt canonical input mismatch is rejected", () => {
  const x = baseline();
  const receipt = JSON.parse(x.receiptBytes.toString("utf8"));
  receipt.input.canonical_hash = "99".repeat(32);
  const receiptBytes = Buffer.from(JSON.stringify(receipt), "utf8");
  const verification = {
    ...x.verification,
    receipt_sha256: sha256Bytes(receiptBytes),
  };
  expectCode(
    () => admit({ receiptBytes, paygodVerification: verification }),
    "DECISION_RECEIPT_INPUT_HASH_MISMATCH"
  );
});

test("A48 wrong pack contract is rejected", () => {
  const x = baseline();
  const receipt = JSON.parse(x.receiptBytes.toString("utf8"));
  receipt.pack.digest_sha256 = "aa".repeat(32);
  const receiptBytes = Buffer.from(JSON.stringify(receipt), "utf8");
  const verification = {
    ...x.verification,
    receipt_sha256: sha256Bytes(receiptBytes),
  };
  expectCode(
    () => admit({ receiptBytes, paygodVerification: verification }),
    "DECISION_PACK_CONTRACT_MISMATCH"
  );
});

test("authenticated receipt with wrong verdict/rule is rejected", () => {
  const x = baseline();
  const receipt = JSON.parse(x.receiptBytes.toString("utf8"));
  receipt.verdict.value = "deny";
  const receiptBytes = Buffer.from(JSON.stringify(receipt), "utf8");
  const verification = {
    ...x.verification,
    receipt_sha256: sha256Bytes(receiptBytes),
  };
  expectCode(
    () => admit({ receiptBytes, paygodVerification: verification }),
    "DECISION_VERDICT_CONTRACT_MISMATCH"
  );
});

test("decision admission preserves replay separation", () => {
  const x = baseline();
  expectCode(
    () =>
      admit({
        paygodVerification: {
          ...x.verification,
          verification: {
            ...x.verification.verification,
            replay: "verified",
          },
        },
      }),
    "DECISION_REPLAY_STATE_MISMATCH"
  );
});

test("decision admission rejects release candidate derivation drift", () => {
  const x = baseline();
  const candidate = JSON.parse(x.candidate.bytes.toString("utf8"));
  candidate.transition.target = "0x" + "ab".repeat(20);
  expectCode(
    () =>
      admit({
        candidateBytes: Buffer.from(JSON.stringify(candidate), "utf8"),
      }),
    "RELEASE_CANDIDATE_DERIVATION_MISMATCH"
  );
});

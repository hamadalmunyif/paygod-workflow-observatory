import test from "node:test";
import assert from "node:assert/strict";

import { AuthorityError } from "../src/authority-error.mjs";
import { sha256Bytes } from "../src/digest.mjs";
import {
  buildControlledReleaseCandidateV0,
} from "../src/controlled-release-candidate-v0.mjs";
import { verifyReleaseDecisionChainV0 } from "../src/release-decision-chain-v0.mjs";
import { buildTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";

const requestIdentity = "11".repeat(32);
const payloadDigest = "22".repeat(32);
const d1PackDigest = "33".repeat(32);
const d2PackDigest = "44".repeat(32);
const d1InputHash = "55".repeat(32);
const d2InputHash = "66".repeat(32);

function requestShadow() {
  return {
    kind: "acp-request-shadow",
    mode: "shadow-only",
    request: {
      status: "CANDIDATE_LOCAL_VALIDATED",
      schemaValidation: "LOCAL_VALIDATED",
      admittedRequestIdentitySha256: requestIdentity,
      requestPayloadArtifactSha256: payloadDigest,
      attemptId: "attempt-chain-1",
      attemptCommitmentSha256: "77".repeat(32),
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
    requestIdentitySha256: requestIdentity,
    transaction: {
      system: "evm",
      chainId: 31337,
      executionAccount: "0x" + "88".repeat(20),
      target: "0x" + "99".repeat(20),
      calldataSha256: "aa".repeat(32),
      nativeValue: "0",
    },
    payload: {
      channel: "controlled-requirement-message/v0",
      recipient: "0x" + "bb".repeat(20),
      contentType: "requirement",
      payloadSha256: payloadDigest,
    },
  });
}

function receipt({ packName, packVersion, packDigest, inputHash, verdict, rule }) {
  return Buffer.from(
    JSON.stringify({
      api_version: "paygod/v1",
      kind: "Receipt",
      spec_version: "0.2.0",
      clock: { value: "1970-01-01T00:00:00Z", source: "env:PAYGOD_CLOCK" },
      canonicalization: { json: "paygod-c14n-v1" },
      runner: { image: "test", image_digest: "git:test" },
      pack: {
        name: packName,
        version: packVersion,
        path: "packs/" + packName,
        digest_sha256: packDigest,
      },
      input: { canonical_hash: inputHash },
      bundle: {
        bundle_digest: "cc".repeat(32),
        manifest_sha256: "dd".repeat(32),
        files: [{ name: "plan.json", sha256: "ee".repeat(32), bytes: 1 }],
      },
      verdict: { value: verdict, rule_name: rule, reason: "test" },
      replay: { command: "test" },
    }),
    "utf8"
  );
}

function verification(receiptBytes, keyId = "controlled-decision-ed25519:test") {
  return {
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
      key_id: keyId,
      receipt_sha256_matches: true,
      key_trusted: true,
      signature_valid: true,
      reason: "verified",
    },
  };
}

function profile() {
  return {
    schema: "workflow-observatory/controlled-release-profile/v0",
    paygodKernelCommit: "23ea2cca74ef8b698718c6d0c8dbda447f13bb37",
    standaloneVerifierVersion: "0.4.0",
    admissionPack: {
      path: "packs/acp-request-admission-shadow",
      name: "acp-request-admission-shadow",
      version: "0.2.0",
      digestSha256: d1PackDigest,
      allowedVerdict: "allow",
      allowedRule: "shadow-admitted",
    },
    pack: {
      path: "packs/controlled-authority-release-v0",
      name: "controlled-authority-release-v0",
      version: "0.2.0",
      digestSha256: d2PackDigest,
      allowedVerdict: "allow",
      allowedRule: "controlled-local-release",
    },
    enforcementDomain: "controlled-harness/t0-v0",
    chainId: 31337,
    paygodReceiptIssuerAuthenticityRequired: true,
    paygodDecisionReplayPerformed: false,
    externalExecutionAuthorized: false,
    paygodReceiptSignatureProfile: "paygod-ed25519-receipt-v1",
    paygodReceiptTrustProfile: "paygod-ed25519-trust-v1",
    paygodDecisionIssuerKeyScope: "ephemeral-controlled-harness-epoch",
    decisionChainRequiresSameIssuerKey: true,
  };
}

function baseline() {
  const shadow = requestShadow();
  const tx = transition();
  const d1 = receipt({
    packName: "acp-request-admission-shadow",
    packVersion: "0.2.0",
    packDigest: d1PackDigest,
    inputHash: d1InputHash,
    verdict: "allow",
    rule: "shadow-admitted",
  });
  const candidate = buildControlledReleaseCandidateV0({
    requestShadow: shadow,
    transitionEnvelopeBytes: tx.bytes,
    admissionReceiptBytes: d1,
  });
  const d2 = receipt({
    packName: "controlled-authority-release-v0",
    packVersion: "0.2.0",
    packDigest: d2PackDigest,
    inputHash: d2InputHash,
    verdict: "allow",
    rule: "controlled-local-release",
  });
  return { shadow, tx, d1, candidate, d2 };
}

function expectCode(fn, code) {
  assert.throws(
    fn,
    (err) => err instanceof AuthorityError && err.code === code
  );
}

test("decision chain v0 verifies D1 -> candidate -> D2 without upgrading external authority", () => {
  const x = baseline();
  const result = verifyReleaseDecisionChainV0({
    requestShadow: x.shadow,
    requestShadowCanonicalHash: d1InputHash,
    admissionReceiptBytes: x.d1,
    admissionVerification: verification(x.d1),
    transitionEnvelopeBytes: x.tx.bytes,
    releaseCandidateBytes: x.candidate.bytes,
    releaseCandidateCanonicalHash: d2InputHash,
    releaseReceiptBytes: x.d2,
    releaseVerification: verification(x.d2),
    profile: profile(),
  });

  assert.equal(result.status, "DECISION_CHAIN_VERIFIED");
  assert.equal(result.requestIdentity, requestIdentity);
  assert.equal(result.transitionCommitment, x.tx.transitionCommitment);
  assert.equal(result.d1.verdict, "allow");
  assert.equal(result.d1.rule, "shadow-admitted");
  assert.equal(result.d2.verdict, "allow");
  assert.equal(result.d2.rule, "controlled-local-release");
  assert.equal(result.externalExecutionAuthorized, false);
});

test("decision chain rejects D1 canonical input mismatch", () => {
  const x = baseline();
  expectCode(
    () =>
      verifyReleaseDecisionChainV0({
        requestShadow: x.shadow,
        requestShadowCanonicalHash: "12".repeat(32),
        admissionReceiptBytes: x.d1,
        admissionVerification: verification(x.d1),
        transitionEnvelopeBytes: x.tx.bytes,
        releaseCandidateBytes: x.candidate.bytes,
        releaseCandidateCanonicalHash: d2InputHash,
        releaseReceiptBytes: x.d2,
        releaseVerification: verification(x.d2),
        profile: profile(),
      }),
    "DECISION_CHAIN_D1_INPUT_HASH_MISMATCH"
  );
});

test("decision chain rejects D2 canonical input mismatch", () => {
  const x = baseline();
  expectCode(
    () =>
      verifyReleaseDecisionChainV0({
        requestShadow: x.shadow,
        requestShadowCanonicalHash: d1InputHash,
        admissionReceiptBytes: x.d1,
        admissionVerification: verification(x.d1),
        transitionEnvelopeBytes: x.tx.bytes,
        releaseCandidateBytes: x.candidate.bytes,
        releaseCandidateCanonicalHash: "13".repeat(32),
        releaseReceiptBytes: x.d2,
        releaseVerification: verification(x.d2),
        profile: profile(),
      }),
    "DECISION_CHAIN_D2_INPUT_HASH_MISMATCH"
  );
});

test("decision chain rejects admission pack digest drift", () => {
  const x = baseline();
  const p = profile();
  p.admissionPack.digestSha256 = "14".repeat(32);
  expectCode(
    () =>
      verifyReleaseDecisionChainV0({
        requestShadow: x.shadow,
        requestShadowCanonicalHash: d1InputHash,
        admissionReceiptBytes: x.d1,
        admissionVerification: verification(x.d1),
        transitionEnvelopeBytes: x.tx.bytes,
        releaseCandidateBytes: x.candidate.bytes,
        releaseCandidateCanonicalHash: d2InputHash,
        releaseReceiptBytes: x.d2,
        releaseVerification: verification(x.d2),
        profile: p,
      }),
    "DECISION_CHAIN_D1_PACK_DIGEST_MISMATCH"
  );
});

test("decision chain rejects D1 receipt substitution after D2 candidate freeze", () => {
  const x = baseline();
  const alternateD1 = receipt({
    packName: "acp-request-admission-shadow",
    packVersion: "0.2.0",
    packDigest: d1PackDigest,
    inputHash: "15".repeat(32),
    verdict: "allow",
    rule: "shadow-admitted",
  });
  expectCode(
    () =>
      verifyReleaseDecisionChainV0({
        requestShadow: x.shadow,
        requestShadowCanonicalHash: "15".repeat(32),
        admissionReceiptBytes: alternateD1,
        admissionVerification: verification(x.d1),
        transitionEnvelopeBytes: x.tx.bytes,
        releaseCandidateBytes: x.candidate.bytes,
        releaseCandidateCanonicalHash: d2InputHash,
        releaseReceiptBytes: x.d2,
        releaseVerification: verification(x.d2),
        profile: profile(),
      }),
    "DECISION_CHAIN_D1_VERIFIED_RECEIPT_DIGEST_MISMATCH"
  );
});

test("decision chain rejects D1/D2 decision issuer epoch mismatch", () => {
  const x = baseline();
  expectCode(
    () =>
      verifyReleaseDecisionChainV0({
        requestShadow: x.shadow,
        requestShadowCanonicalHash: d1InputHash,
        admissionReceiptBytes: x.d1,
        admissionVerification: verification(x.d1, "controlled-decision-ed25519:epoch-a"),
        transitionEnvelopeBytes: x.tx.bytes,
        releaseCandidateBytes: x.candidate.bytes,
        releaseCandidateCanonicalHash: d2InputHash,
        releaseReceiptBytes: x.d2,
        releaseVerification: verification(x.d2, "controlled-decision-ed25519:epoch-b"),
        profile: profile(),
      }),
    "DECISION_CHAIN_DECISION_ISSUER_EPOCH_MISMATCH"
  );
});

test("decision chain rejects unauthenticated D1 receipt", () => {
  const x = baseline();
  const unverified = verification(x.d1);
  unverified.verification.issuer_authenticity = "not_verified";
  expectCode(
    () =>
      verifyReleaseDecisionChainV0({
        requestShadow: x.shadow,
        requestShadowCanonicalHash: d1InputHash,
        admissionReceiptBytes: x.d1,
        admissionVerification: unverified,
        transitionEnvelopeBytes: x.tx.bytes,
        releaseCandidateBytes: x.candidate.bytes,
        releaseCandidateCanonicalHash: d2InputHash,
        releaseReceiptBytes: x.d2,
        releaseVerification: verification(x.d2),
        profile: profile(),
      }),
    "DECISION_CHAIN_D1_AUTHENTICITY_NOT_VERIFIED"
  );
});

test("decision chain rejects D2 wrong rule", () => {
  const x = baseline();
  const wrongD2 = receipt({
    packName: "controlled-authority-release-v0",
    packVersion: "0.2.0",
    packDigest: d2PackDigest,
    inputHash: d2InputHash,
    verdict: "allow",
    rule: "some-other-rule",
  });
  expectCode(
    () =>
      verifyReleaseDecisionChainV0({
        requestShadow: x.shadow,
        requestShadowCanonicalHash: d1InputHash,
        admissionReceiptBytes: x.d1,
        admissionVerification: verification(x.d1),
        transitionEnvelopeBytes: x.tx.bytes,
        releaseCandidateBytes: x.candidate.bytes,
        releaseCandidateCanonicalHash: d2InputHash,
        releaseReceiptBytes: wrongD2,
        releaseVerification: verification(x.d2),
        profile: profile(),
      }),
    "DECISION_CHAIN_D2_VERDICT_MISMATCH"
  );
});

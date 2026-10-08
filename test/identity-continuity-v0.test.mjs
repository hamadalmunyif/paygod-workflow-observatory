import test from "node:test";
import assert from "node:assert/strict";

import { AuthorityError } from "../src/authority-error.mjs";
import { sha256Bytes } from "../src/digest.mjs";
import { canonicalizePayGodJsonBytesV1 } from "../src/paygod-c14n-v1.mjs";
import { buildTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";
import { buildControlledReleaseCandidateV0 } from "../src/controlled-release-candidate-v0.mjs";
import { verifyControlledDecisionAdmissionV0 } from "../src/controlled-decision-admission-v0.mjs";
import {
  buildWarrantBodyV0,
  generateIssuerKeyPairV0,
  issuerKeyIdFromPublicKey,
  signWarrantBodyV0,
  exportIssuerPublicKeySpkiDer,
  verifyWarrantV0,
} from "../src/warrant-v0.mjs";

const identity = "11".repeat(32);
const payloadDigest = "22".repeat(32);
const attemptCommitment = "33".repeat(32);
const packDigestA =
  "ea21e54e165c90418a6d4a903108441fa6d7c0e2c425adc14c0f62a430b9dc7b";
const packDigestB = "ab".repeat(32);

function expectCode(fn, code) {
  assert.throws(fn, (err) => err instanceof AuthorityError && err.code === code);
}

function shadow() {
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

function transition(targetByte) {
  return buildTransitionEnvelopeV0({
    requestIdentitySha256: identity,
    transaction: {
      system: "evm",
      chainId: 31337,
      executionAccount: "0x" + "55".repeat(20),
      target: "0x" + targetByte.repeat(20),
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

function profile(packDigest = packDigestA) {
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

function decisionFixture(tx, packDigest = packDigestA) {
  const requestShadow = shadow();
  const candidate = buildControlledReleaseCandidateV0({
    requestShadow,
    transitionEnvelopeBytes: tx.bytes,
  });
  const candidateHash = canonicalizePayGodJsonBytesV1(candidate.bytes).hash;
  const receipt = {
    input: { canonical_hash: candidateHash },
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
  const receiptBytes = Buffer.from(JSON.stringify(receipt), "utf8");
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
    requestShadow,
    tx,
    candidate,
    candidateHash,
    receiptBytes,
    verification,
    validate: { status: "success", data: { hash: candidateHash } },
  };
}

function admit(fixture, overrides = {}) {
  return verifyControlledDecisionAdmissionV0({
    candidateBytes: overrides.candidateBytes ?? fixture.candidate.bytes,
    requestShadow: overrides.requestShadow ?? fixture.requestShadow,
    transitionEnvelopeBytes:
      overrides.transitionEnvelopeBytes ?? fixture.tx.bytes,
    releaseProfile: overrides.releaseProfile ?? profile(),
    paygodValidate: overrides.paygodValidate ?? fixture.validate,
    receiptBytes: overrides.receiptBytes ?? fixture.receiptBytes,
    paygodVerification:
      overrides.paygodVerification ?? fixture.verification,
  });
}

const runA = decisionFixture(transition("66"));
const runB = decisionFixture(transition("99"));

test("matrix controls: coherent A+A and B+B decisions are admitted", () => {
  assert.equal(admit(runA).status, "AUTHENTICATED_CANONICAL_ALLOW");
  assert.equal(admit(runB).status, "AUTHENTICATED_CANONICAL_ALLOW");
  assert.notEqual(runA.candidateHash, runB.candidateHash);
});

const decisionMatrix = [
  {
    edge: "Request/Transition -> Release Candidate",
    expectedCode: "RELEASE_CANDIDATE_DERIVATION_MISMATCH",
    cross(left, right) {
      return () =>
        admit(left, {
          candidateBytes: left.candidate.bytes,
          requestShadow: right.requestShadow,
          transitionEnvelopeBytes: right.tx.bytes,
        });
    },
  },
  {
    edge: "Release Candidate -> PayGod validate hash",
    expectedCode: "DECISION_VALIDATE_CANDIDATE_HASH_MISMATCH",
    cross(left, right) {
      return () =>
        admit(left, {
          paygodValidate: right.validate,
        });
    },
  },
  {
    edge: "Release Candidate -> Decision Receipt",
    expectedCode: "DECISION_RECEIPT_INPUT_HASH_MISMATCH",
    cross(left, right) {
      return () =>
        admit(left, {
          receiptBytes: right.receiptBytes,
          paygodVerification: right.verification,
        });
    },
  },
  {
    edge: "Decision Receipt -> Verification result",
    expectedCode: "DECISION_RECEIPT_DIGEST_MISMATCH",
    cross(left, right) {
      return () =>
        admit(left, {
          paygodVerification: right.verification,
        });
    },
  },
];

for (const matrixCase of decisionMatrix) {
  test(`A/B matrix: ${matrixCase.edge} rejects A+B and B+A`, () => {
    expectCode(matrixCase.cross(runA, runB), matrixCase.expectedCode);
    expectCode(matrixCase.cross(runB, runA), matrixCase.expectedCode);
  });
}

test("A/B matrix: Policy/Profile -> Decision Receipt rejects both valid cross-profile substitutions", () => {
  const policyA = decisionFixture(transition("66"), packDigestA);
  const policyB = decisionFixture(transition("66"), packDigestB);

  expectCode(
    () =>
      admit(policyA, {
        releaseProfile: profile(packDigestA),
        receiptBytes: policyB.receiptBytes,
        paygodVerification: policyB.verification,
      }),
    "DECISION_PACK_CONTRACT_MISMATCH"
  );

  expectCode(
    () =>
      admit(policyB, {
        releaseProfile: profile(packDigestB),
        receiptBytes: policyA.receiptBytes,
        paygodVerification: policyA.verification,
      }),
    "DECISION_PACK_CONTRACT_MISMATCH"
  );

  assert.equal(
    admit(policyA, { releaseProfile: profile(packDigestA) }).status,
    "AUTHENTICATED_CANONICAL_ALLOW"
  );
  assert.equal(
    admit(policyB, { releaseProfile: profile(packDigestB) }).status,
    "AUTHENTICATED_CANONICAL_ALLOW"
  );
});

test("A/B matrix: Warrant -> Transition rejects both cross-run substitutions while coherent controls verify", () => {
  const { publicKey, privateKey } = generateIssuerKeyPairV0();
  const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
  const trustedIssuers = new Map([
    [issuerKeyId, exportIssuerPublicKeySpkiDer(publicKey)],
  ]);

  function makeSigned(tx, nonceByte) {
    const body = buildWarrantBodyV0({
      transitionCommitment: tx.transitionCommitment,
      notBefore: 1_000,
      expiresAt: 2_000,
      nonce: nonceByte.repeat(32),
      issuerKeyId,
    });
    return signWarrantBodyV0({
      bodyBytes: body.bytes,
      privateKey,
      publicKey,
    });
  }

  const warrantA = makeSigned(runA.tx, "aa");
  const warrantB = makeSigned(runB.tx, "bb");

  assert.equal(
    verifyWarrantV0({
      bodyBytes: warrantA.bodyBytes,
      signatureBytes: warrantA.signatureBytes,
      trustedIssuers,
      expectedTransitionCommitment: runA.tx.transitionCommitment,
      nowMs: 1_500,
    }).status,
    "VALID"
  );

  assert.equal(
    verifyWarrantV0({
      bodyBytes: warrantB.bodyBytes,
      signatureBytes: warrantB.signatureBytes,
      trustedIssuers,
      expectedTransitionCommitment: runB.tx.transitionCommitment,
      nowMs: 1_500,
    }).status,
    "VALID"
  );

  expectCode(
    () =>
      verifyWarrantV0({
        bodyBytes: warrantA.bodyBytes,
        signatureBytes: warrantA.signatureBytes,
        trustedIssuers,
        expectedTransitionCommitment: runB.tx.transitionCommitment,
        nowMs: 1_500,
      }),
    "WARRANT_TRANSITION_COMMITMENT_MISMATCH"
  );

  expectCode(
    () =>
      verifyWarrantV0({
        bodyBytes: warrantB.bodyBytes,
        signatureBytes: warrantB.signatureBytes,
        trustedIssuers,
        expectedTransitionCommitment: runA.tx.transitionCommitment,
        nowMs: 1_500,
      }),
    "WARRANT_TRANSITION_COMMITMENT_MISMATCH"
  );
});

test("Warrant v0 limitation is explicit: body has no direct decision-receipt or candidate commitment", () => {
  const { publicKey } = generateIssuerKeyPairV0();
  const body = buildWarrantBodyV0({
    transitionCommitment: runA.tx.transitionCommitment,
    notBefore: 1_000,
    expiresAt: 2_000,
    nonce: "cc".repeat(32),
    issuerKeyId: issuerKeyIdFromPublicKey(publicKey),
  }).body;

  assert.equal(Object.hasOwn(body, "decision_receipt_sha256"), false);
  assert.equal(Object.hasOwn(body, "release_candidate_canonical_hash"), false);
  assert.equal(Object.hasOwn(body, "pack_digest_sha256"), false);
  assert.equal(Object.hasOwn(body, "decision_issuer_key_id"), false);
});

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

test("A/B matrix: transition B plus coherent candidate B cannot reuse decision artifacts A", () => {
  const a = decisionFixture(transition("66"));
  const b = decisionFixture(transition("99"));

  assert.notEqual(a.candidateHash, b.candidateHash);

  expectCode(
    () =>
      verifyControlledDecisionAdmissionV0({
        candidateBytes: b.candidate.bytes,
        requestShadow: b.requestShadow,
        transitionEnvelopeBytes: b.tx.bytes,
        releaseProfile: profile(),
        paygodValidate: a.validate,
        receiptBytes: a.receiptBytes,
        paygodVerification: a.verification,
      }),
    "DECISION_VALIDATE_CANDIDATE_HASH_MISMATCH"
  );
});

test("A/B matrix: valid decision receipt from policy B cannot satisfy policy profile A", () => {
  const tx = transition("66");
  const b = decisionFixture(tx, packDigestB);

  expectCode(
    () =>
      verifyControlledDecisionAdmissionV0({
        candidateBytes: b.candidate.bytes,
        requestShadow: b.requestShadow,
        transitionEnvelopeBytes: b.tx.bytes,
        releaseProfile: profile(packDigestA),
        paygodValidate: b.validate,
        receiptBytes: b.receiptBytes,
        paygodVerification: b.verification,
      }),
    "DECISION_PACK_CONTRACT_MISMATCH"
  );
});

test("A/B matrix: verification result B cannot authenticate receipt A bytes", () => {
  const a = decisionFixture(transition("66"));
  const b = decisionFixture(transition("99"));

  expectCode(
    () =>
      verifyControlledDecisionAdmissionV0({
        candidateBytes: a.candidate.bytes,
        requestShadow: a.requestShadow,
        transitionEnvelopeBytes: a.tx.bytes,
        releaseProfile: profile(),
        paygodValidate: a.validate,
        receiptBytes: a.receiptBytes,
        paygodVerification: b.verification,
      }),
    "DECISION_RECEIPT_DIGEST_MISMATCH"
  );
});

test("A/B matrix: Warrant for transition A cannot verify against transition B", () => {
  const txA = transition("66");
  const txB = transition("99");
  const { publicKey, privateKey } = generateIssuerKeyPairV0();
  const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);

  const body = buildWarrantBodyV0({
    transitionCommitment: txA.transitionCommitment,
    notBefore: 1_000,
    expiresAt: 2_000,
    nonce: "aa".repeat(32),
    issuerKeyId,
  });
  const signed = signWarrantBodyV0({
    bodyBytes: body.bytes,
    privateKey,
    publicKey,
  });

  expectCode(
    () =>
      verifyWarrantV0({
        bodyBytes: signed.bodyBytes,
        signatureBytes: signed.signatureBytes,
        trustedIssuers: new Map([
          [issuerKeyId, exportIssuerPublicKeySpkiDer(publicKey)],
        ]),
        expectedTransitionCommitment: txB.transitionCommitment,
        nowMs: 1_500,
      }),
    "WARRANT_TRANSITION_COMMITMENT_MISMATCH"
  );
});

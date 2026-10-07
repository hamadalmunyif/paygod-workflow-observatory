import test from "node:test";
import assert from "node:assert/strict";

import { AuthorityError } from "../src/authority-error.mjs";
import {
  buildControlledReleaseCandidateV0,
  parseAdmissionReceiptV0,
  verifyControlledReleaseCandidateV0,
} from "../src/controlled-release-candidate-v0.mjs";
import { buildTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";

const identity = "11".repeat(32);
const payloadDigest = "22".repeat(32);
const admissionPackDigest = "aa".repeat(32);
const admissionInputHash = "bb".repeat(32);

function shadow(overrides = {}) {
  return {
    kind: "acp-request-shadow",
    mode: "shadow-only",
    request: {
      status: "CANDIDATE_LOCAL_VALIDATED",
      schemaValidation: "LOCAL_VALIDATED",
      admittedRequestIdentitySha256: identity,
      requestPayloadArtifactSha256: payloadDigest,
      attemptId: "attempt-1",
      attemptCommitmentSha256: "33".repeat(32),
      ...(overrides.request ?? {}),
    },
    authority: {
      acpJobCreationAuthorized: false,
      acpFundingAuthorized: false,
      acpSigningAuthorized: false,
      acpExecutionAuthorized: false,
      ...(overrides.authority ?? {}),
    },
  };
}

function envelope(overrides = {}) {
  return buildTransitionEnvelopeV0({
    requestIdentitySha256: overrides.requestIdentitySha256 ?? identity,
    transaction: {
      system: "evm",
      chainId: overrides.chainId ?? 31337,
      executionAccount: "0x" + "44".repeat(20),
      target: "0x" + "55".repeat(20),
      calldataSha256: "66".repeat(32),
      nativeValue: "0",
    },
    payload: {
      channel: "controlled-requirement-message/v0",
      recipient: "0x" + "77".repeat(20),
      contentType: "requirement",
      payloadSha256: overrides.payloadSha256 ?? payloadDigest,
    },
  });
}

function admissionReceipt(overrides = {}) {
  const receipt = {
    api_version: "paygod/v1",
    kind: "Receipt",
    spec_version: "0.2.0",
    clock: {
      value: "1970-01-01T00:00:00Z",
      source: "env:PAYGOD_CLOCK",
    },
    canonicalization: { json: "paygod-c14n-v1" },
    runner: {
      image: "paygod/internal-shadow",
      image_digest: "git:test",
    },
    pack: {
      name: "acp-request-admission-shadow",
      version: "0.2.0",
      path: "packs/acp-request-admission-shadow",
      digest_sha256: admissionPackDigest,
      ...(overrides.pack ?? {}),
    },
    input: {
      canonical_hash: admissionInputHash,
      ...(overrides.input ?? {}),
    },
    bundle: {
      bundle_digest: "cc".repeat(32),
      manifest_sha256: "dd".repeat(32),
      files: [
        { name: "plan.json", sha256: "ee".repeat(32), bytes: 1 },
      ],
    },
    verdict: {
      value: "allow",
      rule_name: "shadow-admitted",
      reason: "shadow only",
      ...(overrides.verdict ?? {}),
    },
    replay: { command: "test" },
  };
  return Buffer.from(JSON.stringify(receipt), "utf8");
}

function expectCode(fn, code) {
  assert.throws(
    fn,
    (err) => err instanceof AuthorityError && err.code === code
  );
}

test("D1 admission receipt parser accepts only frozen shadow-admission result", () => {
  const parsed = parseAdmissionReceiptV0(admissionReceipt());
  assert.equal(parsed.receipt.pack.name, "acp-request-admission-shadow");
  assert.equal(parsed.receipt.pack.version, "0.2.0");
  assert.equal(parsed.receipt.verdict.value, "allow");
  assert.equal(parsed.receipt.verdict.rule_name, "shadow-admitted");
  assert.equal(parsed.packDigestSha256, admissionPackDigest);
  assert.equal(parsed.inputCanonicalHash, admissionInputHash);
  assert.equal(parsed.receiptSha256.length, 64);
});

test("D1 admission receipt parser rejects wrong pack", () => {
  expectCode(
    () =>
      parseAdmissionReceiptV0(
        admissionReceipt({ pack: { name: "other-pack" } })
      ),
    "RELEASE_ADMISSION_PACK_MISMATCH"
  );
});

test("D1 admission receipt parser rejects wrong verdict/rule", () => {
  expectCode(
    () =>
      parseAdmissionReceiptV0(
        admissionReceipt({ verdict: { rule_name: "other-rule" } })
      ),
    "RELEASE_ADMISSION_VERDICT_MISMATCH"
  );
});

test("controlled release candidate binds D1 receipt, admitted request, exact transition and payload", () => {
  const tx = envelope();
  const d1 = admissionReceipt();
  const result = buildControlledReleaseCandidateV0({
    requestShadow: shadow(),
    transitionEnvelopeBytes: tx.bytes,
    admissionReceiptBytes: d1,
  });

  const parsedD1 = parseAdmissionReceiptV0(d1);
  assert.equal(result.candidate.admission.receipt_sha256, parsedD1.receiptSha256);
  assert.equal(
    result.candidate.admission.input_canonical_hash,
    admissionInputHash
  );
  assert.equal(
    result.candidate.admission.pack_name,
    "acp-request-admission-shadow"
  );
  assert.equal(result.candidate.admission.pack_version, "0.2.0");
  assert.equal(result.candidate.admission.pack_digest_sha256, admissionPackDigest);
  assert.equal(result.candidate.admission.verdict, "allow");
  assert.equal(result.candidate.admission.rule, "shadow-admitted");
  assert.equal(
    result.candidate.request.admitted_request_identity_sha256,
    identity
  );
  assert.equal(result.candidate.request.request_payload_sha256, payloadDigest);
  assert.equal(
    result.candidate.transition.request_identity_sha256,
    identity
  );
  assert.equal(
    result.candidate.transition.payload.payload_sha256,
    payloadDigest
  );
  assert.equal(
    result.candidate.transition.transition_commitment,
    tx.transitionCommitment
  );
  assert.equal(result.candidate.transition.chain_id, 31337);
  assert.equal(result.candidate.authority.local_only, true);
  assert.equal(result.candidate.authority.external_execution_authorized, false);
});

test("controlled release candidate rejects request identity substitution", () => {
  const tx = envelope({ requestIdentitySha256: "88".repeat(32) });
  expectCode(
    () =>
      buildControlledReleaseCandidateV0({
        requestShadow: shadow(),
        transitionEnvelopeBytes: tx.bytes,
        admissionReceiptBytes: admissionReceipt(),
      }),
    "RELEASE_REQUEST_TRANSITION_IDENTITY_MISMATCH"
  );
});

test("controlled release candidate rejects payload substitution", () => {
  const tx = envelope({ payloadSha256: "99".repeat(32) });
  expectCode(
    () =>
      buildControlledReleaseCandidateV0({
        requestShadow: shadow(),
        transitionEnvelopeBytes: tx.bytes,
        admissionReceiptBytes: admissionReceipt(),
      }),
    "RELEASE_REQUEST_PAYLOAD_MISMATCH"
  );
});

test("controlled release candidate rejects source authority upgrade", () => {
  const tx = envelope();
  expectCode(
    () =>
      buildControlledReleaseCandidateV0({
        requestShadow: shadow({
          authority: { acpExecutionAuthorized: true },
        }),
        transitionEnvelopeBytes: tx.bytes,
        admissionReceiptBytes: admissionReceipt(),
      }),
    "RELEASE_SOURCE_AUTHORITY_UPGRADE"
  );
});

test("controlled release candidate rejects non-local transition", () => {
  const tx = envelope({ chainId: 8453 });
  expectCode(
    () =>
      buildControlledReleaseCandidateV0({
        requestShadow: shadow(),
        transitionEnvelopeBytes: tx.bytes,
        admissionReceiptBytes: admissionReceipt(),
      }),
    "RELEASE_TRANSITION_NOT_LOCAL"
  );
});

test("controlled release candidate verifier accepts only exact derivation including D1 receipt", () => {
  const tx = envelope();
  const requestShadow = shadow();
  const d1 = admissionReceipt();
  const built = buildControlledReleaseCandidateV0({
    requestShadow,
    transitionEnvelopeBytes: tx.bytes,
    admissionReceiptBytes: d1,
  });

  const verified = verifyControlledReleaseCandidateV0({
    candidateBytes: built.bytes,
    requestShadow,
    transitionEnvelopeBytes: tx.bytes,
    admissionReceiptBytes: d1,
  });

  assert.equal(verified.status, "VERIFIED");
  assert.equal(verified.transitionCommitment, tx.transitionCommitment);
  assert.equal(
    verified.admissionReceiptSha256,
    parseAdmissionReceiptV0(d1).receiptSha256
  );
});

test("release candidate verifier rejects D1 receipt substitution", () => {
  const tx = envelope();
  const requestShadow = shadow();
  const d1 = admissionReceipt();
  const built = buildControlledReleaseCandidateV0({
    requestShadow,
    transitionEnvelopeBytes: tx.bytes,
    admissionReceiptBytes: d1,
  });
  const alternate = admissionReceipt({
    input: { canonical_hash: "12".repeat(32) },
  });

  expectCode(
    () =>
      verifyControlledReleaseCandidateV0({
        candidateBytes: built.bytes,
        requestShadow,
        transitionEnvelopeBytes: tx.bytes,
        admissionReceiptBytes: alternate,
      }),
    "RELEASE_CANDIDATE_DERIVATION_MISMATCH"
  );
});

test("controlled release candidate verifier rejects mutated transition fields", () => {
  const tx = envelope();
  const requestShadow = shadow();
  const d1 = admissionReceipt();
  const built = buildControlledReleaseCandidateV0({
    requestShadow,
    transitionEnvelopeBytes: tx.bytes,
    admissionReceiptBytes: d1,
  });
  const mutated = JSON.parse(built.bytes.toString("utf8"));
  mutated.transition.target = "0x" + "aa".repeat(20);

  expectCode(
    () =>
      verifyControlledReleaseCandidateV0({
        candidateBytes: Buffer.from(JSON.stringify(mutated), "utf8"),
        requestShadow,
        transitionEnvelopeBytes: tx.bytes,
        admissionReceiptBytes: d1,
      }),
    "RELEASE_CANDIDATE_DERIVATION_MISMATCH"
  );
});

test("controlled release candidate verifier rejects forged transition commitment", () => {
  const tx = envelope();
  const requestShadow = shadow();
  const d1 = admissionReceipt();
  const built = buildControlledReleaseCandidateV0({
    requestShadow,
    transitionEnvelopeBytes: tx.bytes,
    admissionReceiptBytes: d1,
  });
  const mutated = JSON.parse(built.bytes.toString("utf8"));
  mutated.transition.transition_commitment = "ab".repeat(32);

  expectCode(
    () =>
      verifyControlledReleaseCandidateV0({
        candidateBytes: Buffer.from(JSON.stringify(mutated), "utf8"),
        requestShadow,
        transitionEnvelopeBytes: tx.bytes,
        admissionReceiptBytes: d1,
      }),
    "RELEASE_CANDIDATE_DERIVATION_MISMATCH"
  );
});

test("controlled release candidate verifier rejects alternate serialization", () => {
  const tx = envelope();
  const requestShadow = shadow();
  const d1 = admissionReceipt();
  const built = buildControlledReleaseCandidateV0({
    requestShadow,
    transitionEnvelopeBytes: tx.bytes,
    admissionReceiptBytes: d1,
  });
  const pretty = Buffer.from(
    JSON.stringify(JSON.parse(built.bytes.toString("utf8")), null, 2),
    "utf8"
  );

  expectCode(
    () =>
      verifyControlledReleaseCandidateV0({
        candidateBytes: pretty,
        requestShadow,
        transitionEnvelopeBytes: tx.bytes,
        admissionReceiptBytes: d1,
      }),
    "RELEASE_CANDIDATE_DERIVATION_MISMATCH"
  );
});

test("controlled release candidate requires attempt identity", () => {
  const tx = envelope();
  expectCode(
    () =>
      buildControlledReleaseCandidateV0({
        requestShadow: shadow({ request: { attemptId: null } }),
        transitionEnvelopeBytes: tx.bytes,
        admissionReceiptBytes: admissionReceipt(),
      }),
    "RELEASE_ATTEMPT_ID_REQUIRED"
  );
});

test("controlled release candidate requires attempt commitment", () => {
  const tx = envelope();
  expectCode(
    () =>
      buildControlledReleaseCandidateV0({
        requestShadow: shadow({
          request: { attemptCommitmentSha256: null },
        }),
        transitionEnvelopeBytes: tx.bytes,
        admissionReceiptBytes: admissionReceipt(),
      }),
    "RELEASE_ATTEMPT_COMMITMENT_INVALID"
  );
});

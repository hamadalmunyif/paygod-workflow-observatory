import test from "node:test";
import assert from "node:assert/strict";

import { AuthorityError } from "../src/authority-error.mjs";
import { buildControlledReleaseCandidateV0 } from "../src/controlled-release-candidate-v0.mjs";
import { buildTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";

const identity = "11".repeat(32);
const payloadDigest = "22".repeat(32);

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

function expectCode(fn, code) {
  assert.throws(
    fn,
    (err) => err instanceof AuthorityError && err.code === code
  );
}

test("controlled release candidate binds admitted request to exact transition and payload", () => {
  const tx = envelope();
  const result = buildControlledReleaseCandidateV0({
    requestShadow: shadow(),
    transitionEnvelopeBytes: tx.bytes,
  });

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
      }),
    "RELEASE_TRANSITION_NOT_LOCAL"
  );
});

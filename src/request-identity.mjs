import { sha256CanonicalJson } from "./digest.mjs";

export class RequestIdentityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RequestIdentityError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new RequestIdentityError(code, message);
}

export function buildRequestIdentityCommitment({
  selectedDescriptor,
  requestPayload,
}) {
  if (!selectedDescriptor) {
    fail("ADMISSION_DESCRIPTOR_NOT_FOUND", "Cannot identify a request without an observed descriptor");
  }
  if (requestPayload === null || requestPayload === undefined) {
    fail("ADMISSION_PAYLOAD_MISSING", "Cannot identify a request without a payload");
  }

  const requirements = selectedDescriptor?.requestContract?.requirements ?? null;
  const commitment = {
    schema: "workflow-observatory/request-identity/v0",
    capability: {
      agentId: selectedDescriptor?.identity?.agentId ?? null,
      capabilityId: selectedDescriptor?.capability?.id ?? null,
      capabilityName: selectedDescriptor?.capability?.name ?? null,
    },
    descriptorCanonicalSha256: sha256CanonicalJson(selectedDescriptor),
    requirementsCanonicalSha256:
      requirements === null ? null : sha256CanonicalJson(requirements),
    requestPayloadCanonicalSha256: sha256CanonicalJson(requestPayload),
  };

  return {
    profile: "workflow-observatory/request-identity/v0",
    commitment,
    submittedRequestIdentitySha256: sha256CanonicalJson(commitment),
    correlationNonce: null,
    nonceSemantics:
      "No nonce is included in request identity v0. Any future correlation nonce must be separately disclosed and cannot strengthen remote binding unless independently observed.",
  };
}

function sameCapability(a, b) {
  return (
    a?.agentId === b?.agentId &&
    a?.capabilityId === b?.capabilityId &&
    a?.capabilityName === b?.capabilityName
  );
}

export function assertSubmittedRequestIdentity({
  selectedDescriptor,
  requestPayload,
  submittedRequestIdentity,
}) {
  if (!submittedRequestIdentity?.submittedRequestIdentitySha256) {
    fail("REQUEST_IDENTITY_REQUIRED", "A frozen submitted request identity is required");
  }

  const recomputed = buildRequestIdentityCommitment({
    selectedDescriptor,
    requestPayload,
  });
  const frozen = submittedRequestIdentity.commitment ?? {};

  if (!sameCapability(recomputed.commitment.capability, frozen.capability)) {
    fail(
      "REQUEST_CAPABILITY_MISMATCH",
      "Current capability identity differs from the frozen submitted request"
    );
  }
  if (
    recomputed.commitment.requirementsCanonicalSha256 !==
    frozen.requirementsCanonicalSha256
  ) {
    fail(
      "REQUEST_REQUIREMENTS_DIGEST_MISMATCH",
      "Current requirements contract differs from the frozen submitted request"
    );
  }
  if (
    recomputed.commitment.requestPayloadCanonicalSha256 !==
    frozen.requestPayloadCanonicalSha256
  ) {
    fail(
      "REQUEST_PAYLOAD_DIGEST_MISMATCH",
      "Current request payload differs from the frozen submitted request"
    );
  }
  if (
    recomputed.commitment.descriptorCanonicalSha256 !==
    frozen.descriptorCanonicalSha256
  ) {
    fail(
      "REQUEST_DESCRIPTOR_DIGEST_MISMATCH",
      "Current descriptor differs from the frozen submitted request"
    );
  }
  if (
    recomputed.submittedRequestIdentitySha256 !==
    submittedRequestIdentity.submittedRequestIdentitySha256
  ) {
    fail(
      "REQUEST_IDENTITY_MISMATCH",
      "Current request identity differs from the frozen submitted request identity"
    );
  }

  return recomputed;
}

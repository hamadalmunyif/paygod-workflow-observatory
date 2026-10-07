import { sha256Bytes } from "./digest.mjs";

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

function asBuffer(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof Uint8Array) return Buffer.from(value);
  fail("REQUEST_ARTIFACT_BYTES_REQUIRED", `${label} must be explicit bytes or UTF-8 text`);
}

function jsonArtifactBytes(value) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

export function exactJsonArtifactDigest(value) {
  const bytes = jsonArtifactBytes(value);
  return {
    sha256: sha256Bytes(bytes),
    byteLength: bytes.length,
  };
}

export function requestArtifactBytes({
  selectedDescriptor,
  requestPayload,
  requestPayloadBytes = null,
}) {
  if (!selectedDescriptor) {
    fail("ADMISSION_DESCRIPTOR_NOT_FOUND", "Cannot identify a request without an observed descriptor");
  }
  if (requestPayload === null || requestPayload === undefined) {
    fail("ADMISSION_PAYLOAD_MISSING", "Cannot identify a request without a payload");
  }

  const requirements = selectedDescriptor?.requestContract?.requirements ?? null;
  return {
    descriptorBytes: jsonArtifactBytes(selectedDescriptor),
    requirementsBytes:
      requirements === null ? null : jsonArtifactBytes(requirements),
    requestPayloadBytes:
      requestPayloadBytes === null || requestPayloadBytes === undefined
        ? jsonArtifactBytes(requestPayload)
        : asBuffer(requestPayloadBytes, "requestPayloadBytes"),
  };
}

export function buildRequestIdentityCommitment({
  selectedDescriptor,
  requestPayload,
  requestPayloadBytes = null,
}) {
  const artifacts = requestArtifactBytes({
    selectedDescriptor,
    requestPayload,
    requestPayloadBytes,
  });
  const requirements = selectedDescriptor?.requestContract?.requirements ?? null;

  const commitment = {
    schema: "workflow-observatory/request-identity/v0",
    byteProfile: "exact-frozen-artifact-bytes/v0",
    capability: {
      agentId: selectedDescriptor?.identity?.agentId ?? null,
      capabilityId: selectedDescriptor?.capability?.id ?? null,
      capabilityName: selectedDescriptor?.capability?.name ?? null,
    },
    descriptorArtifactSha256: sha256Bytes(artifacts.descriptorBytes),
    requirementsArtifactSha256:
      requirements === null ? null : sha256Bytes(artifacts.requirementsBytes),
    requestPayloadArtifactSha256: sha256Bytes(artifacts.requestPayloadBytes),
  };

  const identityBytes = jsonArtifactBytes(commitment);

  return {
    profile: "workflow-observatory/request-identity/v0",
    byteProfile: commitment.byteProfile,
    commitment,
    submittedRequestIdentitySha256: sha256Bytes(identityBytes),
    artifactByteLengths: {
      descriptor: artifacts.descriptorBytes.length,
      requirements:
        artifacts.requirementsBytes === null
          ? null
          : artifacts.requirementsBytes.length,
      requestPayload: artifacts.requestPayloadBytes.length,
      identityCommitment: identityBytes.length,
    },
  };
}

export function buildAttemptCommitment({
  attemptId,
  requestIdentitySha256,
  observationManifestSha256,
}) {
  if (typeof attemptId !== "string" || attemptId.length === 0) {
    fail("ATTEMPT_ID_REQUIRED", "attempt_id is required");
  }
  if (typeof requestIdentitySha256 !== "string" || requestIdentitySha256.length === 0) {
    fail("ATTEMPT_REQUEST_IDENTITY_REQUIRED", "request identity digest is required");
  }
  if (
    typeof observationManifestSha256 !== "string" ||
    observationManifestSha256.length === 0
  ) {
    fail("ATTEMPT_PACK_BINDING_REQUIRED", "observation manifest digest is required");
  }

  const commitment = {
    schema: "workflow-observatory/request-attempt/v0",
    attempt_id: attemptId,
    request_identity_sha256: requestIdentitySha256,
    observation_manifest_sha256: observationManifestSha256,
  };
  const commitmentBytes = jsonArtifactBytes(commitment);

  return {
    ...commitment,
    attempt_commitment_sha256: sha256Bytes(commitmentBytes),
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
  requestPayloadBytes = null,
  submittedRequestIdentity,
}) {
  if (!submittedRequestIdentity?.submittedRequestIdentitySha256) {
    fail("REQUEST_IDENTITY_REQUIRED", "A frozen submitted request identity is required");
  }

  const recomputed = buildRequestIdentityCommitment({
    selectedDescriptor,
    requestPayload,
    requestPayloadBytes,
  });
  const frozen = submittedRequestIdentity.commitment ?? {};

  if (!sameCapability(recomputed.commitment.capability, frozen.capability)) {
    fail(
      "REQUEST_CAPABILITY_MISMATCH",
      "Current capability identity differs from the frozen submitted request"
    );
  }
  if (
    recomputed.commitment.requirementsArtifactSha256 !==
    frozen.requirementsArtifactSha256
  ) {
    fail(
      "REQUEST_REQUIREMENTS_DIGEST_MISMATCH",
      "Current requirements artifact bytes differ from the frozen submitted request"
    );
  }
  if (
    recomputed.commitment.descriptorArtifactSha256 !==
    frozen.descriptorArtifactSha256
  ) {
    fail(
      "REQUEST_DESCRIPTOR_DIGEST_MISMATCH",
      "Current descriptor artifact bytes differ from the frozen submitted request"
    );
  }
  if (
    recomputed.commitment.requestPayloadArtifactSha256 !==
    frozen.requestPayloadArtifactSha256
  ) {
    fail(
      "REQUEST_PAYLOAD_DIGEST_MISMATCH",
      "Current request payload bytes differ from the frozen submitted request"
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

export function assertAttemptCommitment({
  submittedRequestIdentity,
  observationManifestSha256,
}) {
  const attempt = submittedRequestIdentity?.attempt;
  if (!attempt) {
    fail("ATTEMPT_COMMITMENT_REQUIRED", "A frozen request attempt commitment is required");
  }

  if (
    attempt.request_identity_sha256 !==
    submittedRequestIdentity.submittedRequestIdentitySha256
  ) {
    fail(
      "ATTEMPT_REQUEST_IDENTITY_MISMATCH",
      "Attempt commitment does not bind the frozen request identity"
    );
  }
  if (attempt.observation_manifest_sha256 !== observationManifestSha256) {
    fail(
      "ATTEMPT_PACK_BINDING_MISMATCH",
      "Attempt commitment does not bind the verified observation manifest"
    );
  }

  const recomputed = buildAttemptCommitment({
    attemptId: attempt.attempt_id,
    requestIdentitySha256: attempt.request_identity_sha256,
    observationManifestSha256: attempt.observation_manifest_sha256,
  });
  if (recomputed.attempt_commitment_sha256 !== attempt.attempt_commitment_sha256) {
    fail(
      "ATTEMPT_COMMITMENT_MISMATCH",
      "Attempt commitment digest does not match its frozen fields"
    );
  }

  return recomputed;
}

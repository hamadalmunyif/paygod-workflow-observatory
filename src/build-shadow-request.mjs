import { PROVENANCE, provenance } from "./provenance.mjs";
import { validateJsonSchemaSubset } from "./schema-validate.mjs";
import {
  assertAttemptCommitment,
  assertSubmittedRequestIdentity,
  exactJsonArtifactDigest,
} from "./request-identity.mjs";

export class AdmissionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AdmissionError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new AdmissionError(code, message);
}

function offeringDescriptors(descriptorSet) {
  return Array.isArray(descriptorSet?.descriptors)
    ? descriptorSet.descriptors.filter((item) => item?.descriptorType === "offering")
    : [];
}

function schemaDecisionReason(validation) {
  const first = validation?.errors?.[0]?.code;
  return first ? `SCHEMA_${first}` : "SCHEMA_REJECTED";
}

export function buildShadowRequest({
  descriptorSet,
  observationManifest,
  packVerification,
  offeringName,
  requestPayload = null,
  requestPayloadBytes = null,
  submittedRequestIdentity = null,
}) {
  if (packVerification?.status !== "VERIFIED") {
    fail("PACK_NOT_VERIFIED", "Observation pack must be verified before projection/admission");
  }

  const offerings = offeringDescriptors(descriptorSet);
  const selected =
    offerings.find((item) => item?.capability?.name === offeringName) ?? null;
  const payloadPresent = requestPayload !== null;
  const requirements = selected?.requestContract?.requirements ?? null;

  let schemaValidation = "NOT_RUN";
  let validationErrorCount = 0;
  let validationCodes = [];
  let decisionReasonCode;

  if (!selected) {
    decisionReasonCode = "ADMISSION_DESCRIPTOR_NOT_FOUND";
  } else if (!payloadPresent) {
    decisionReasonCode = "ADMISSION_PAYLOAD_MISSING";
  } else if (requirements) {
    const validation = validateJsonSchemaSubset(requirements, requestPayload);
    schemaValidation = validation.ok ? "LOCAL_VALIDATED" : "LOCAL_REJECTED";
    validationErrorCount = validation.errors.length;
    validationCodes = validation.errors.map((error) => error.code);
    decisionReasonCode = validation.ok
      ? "ADMISSION_LOCAL_VALIDATED"
      : schemaDecisionReason(validation);
  } else {
    schemaValidation = "UNAVAILABLE";
    decisionReasonCode = "ADMISSION_SCHEMA_UNAVAILABLE";
  }

  const requestStatus = !selected
    ? "WITHHELD_NO_DESCRIPTOR"
    : !payloadPresent
      ? "WITHHELD_NO_PAYLOAD"
      : schemaValidation === "LOCAL_REJECTED"
        ? "WITHHELD_SCHEMA_INVALID"
        : schemaValidation === "LOCAL_VALIDATED"
          ? "CANDIDATE_LOCAL_VALIDATED"
          : "CANDIDATE_UNVALIDATED";

  const descriptorArtifact = selected
    ? exactJsonArtifactDigest(selected)
    : null;
  const requirementsArtifact =
    requirements === null ? null : exactJsonArtifactDigest(requirements);

  const selectedDescriptorRef = selected
    ? {
        descriptorType: selected.descriptorType ?? null,
        agentId: selected.identity?.agentId ?? null,
        capabilityId: selected.capability?.id ?? null,
        capabilityName: selected.capability?.name ?? null,
        descriptorArtifactSha256: descriptorArtifact.sha256,
        descriptorArtifactByteLength: descriptorArtifact.byteLength,
        requirementsArtifactSha256: requirementsArtifact?.sha256 ?? null,
        requirementsArtifactByteLength: requirementsArtifact?.byteLength ?? null,
      }
    : null;

  let frozenIdentity = null;
  let verifiedAttempt = null;
  if (selected && payloadPresent) {
    frozenIdentity = assertSubmittedRequestIdentity({
      selectedDescriptor: selected,
      requestPayload,
      requestPayloadBytes,
      submittedRequestIdentity,
    });
    verifiedAttempt = assertAttemptCommitment({
      submittedRequestIdentity,
      observationManifestSha256: packVerification.manifestCanonicalSha256,
    });
  }

  return {
    kind: "acp-request-shadow",
    mode: "shadow-only",
    source: {
      system: "acp",
      acquisition: "authenticated-read",
      observationBinding: {
        rawSha256: observationManifest?.source?.sha256 ?? null,
        normalizedCanonicalSha256:
          observationManifest?.normalized?.canonicalSha256 ?? null,
        manifestCanonicalSha256:
          packVerification?.manifestCanonicalSha256 ?? null,
      },
      packVerification: {
        status: packVerification.status,
        derivation: packVerification.derivation,
        externalAnchorStatus: packVerification.externalAnchorStatus,
        observationAuthenticity: packVerification.observationAuthenticity,
        trustStateSemantics: "RECOMPUTED_BY_VERIFIER_NOT_PRODUCER_CLAIM",
      },
      provenance: provenance(
        PROVENANCE.LOCAL_DERIVED,
        "bound from a verified Workflow Observatory observation pack"
      ),
    },
    workflow: {
      descriptorPresent: Boolean(selected),
      requestedOfferingName: offeringName,
      selectedDescriptorRef,
      provenance: selected
        ? provenance(
            PROVENANCE.LOCAL_DERIVED,
            "selected by exact offering name and bound by exact local artifact-byte digest"
          )
        : provenance(
            PROVENANCE.UNKNOWN,
            "requested offering name not observed in descriptor set"
          ),
    },
    request: {
      status: requestStatus,
      decisionReasonCode,
      payloadPresent,
      requestPayloadArtifactSha256:
        frozenIdentity?.commitment?.requestPayloadArtifactSha256 ?? null,
      submittedRequestIdentitySha256:
        frozenIdentity?.submittedRequestIdentitySha256 ?? null,
      admittedRequestIdentitySha256:
        schemaValidation === "LOCAL_VALIDATED"
          ? frozenIdentity?.submittedRequestIdentitySha256 ?? null
          : null,
      identityProfile:
        frozenIdentity?.profile ?? "workflow-observatory/request-identity/v0",
      byteProfile:
        frozenIdentity?.byteProfile ?? "exact-frozen-artifact-bytes/v0",
      attemptId: verifiedAttempt?.attempt_id ?? null,
      attemptCommitmentSha256:
        verifiedAttempt?.attempt_commitment_sha256 ?? null,
      requirementsSchemaObserved: requirements !== null,
      schemaValidation,
      validationErrorCount,
      validationCodes,
      provenance: payloadPresent
        ? provenance(
            PROVENANCE.LOCAL_DERIVED,
            "candidate payload verified against frozen exact-byte request artifacts; raw payload remains outside PayGod input"
          )
        : provenance(PROVENANCE.UNKNOWN, "no request payload supplied"),
    },
    evidenceAdmission: {
      rawDescriptorAdmittedToPayGod: false,
      rawRequestPayloadAdmittedToPayGod: false,
      reason:
        "External ACP descriptor/request payload remain in the Observation Pack/request artifacts; PayGod receives digest-bound admission metadata only.",
    },
    authority: {
      acpJobCreationAuthorized: false,
      acpFundingAuthorized: false,
      acpSigningAuthorized: false,
      acpExecutionAuthorized: false,
      paygodMode: "shadow-only",
    },
    trust: {
      observationIntegrity: "VERIFIED_WITHIN_PACK",
      observationAuthenticity: "NOT_PROVEN",
      externalManifestAnchor: packVerification.externalAnchorStatus,
      sourceTruth: "UNKNOWN",
      independentTimeAuthority: "UNKNOWN",
      requestSchemaCorrectness:
        schemaValidation === "LOCAL_VALIDATED"
          ? "LOCAL_VALIDATED_NOT_ACP_ACCEPTANCE"
          : "NOT_VALIDATED",
      decisionArtifactPortability:
        "PRODUCED_NOT_INDEPENDENTLY_VERIFIED_FOR_THIS_WITNESS",
    },
  };
}

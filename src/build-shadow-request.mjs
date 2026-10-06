import { PROVENANCE, provenance } from "./provenance.mjs";
import { sha256CanonicalJson } from "./digest.mjs";
import { validateJsonSchemaSubset } from "./schema-validate.mjs";

function offeringDescriptors(descriptorSet) {
  return Array.isArray(descriptorSet?.descriptors)
    ? descriptorSet.descriptors.filter((item) => item?.descriptorType === "offering")
    : [];
}

export function buildShadowRequest({
  descriptorSet,
  observationManifest,
  offeringName,
  requestPayload = null,
}) {
  const offerings = offeringDescriptors(descriptorSet);
  const selected =
    offerings.find((item) => item?.capability?.name === offeringName) ?? null;
  const payloadPresent = requestPayload !== null;
  const requirements = selected?.requestContract?.requirements ?? null;

  let schemaValidation = "NOT_RUN";
  let validationErrorCount = 0;

  if (selected && payloadPresent) {
    if (requirements) {
      const validation = validateJsonSchemaSubset(requirements, requestPayload);
      schemaValidation = validation.ok ? "LOCAL_VALIDATED" : "LOCAL_REJECTED";
      validationErrorCount = validation.errors.length;
    } else {
      schemaValidation = "UNAVAILABLE";
    }
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

  const selectedDescriptorRef = selected
    ? {
        descriptorType: selected.descriptorType ?? null,
        agentId: selected.identity?.agentId ?? null,
        capabilityId: selected.capability?.id ?? null,
        capabilityName: selected.capability?.name ?? null,
        descriptorCanonicalSha256: sha256CanonicalJson(selected),
        requirementsCanonicalSha256:
          requirements === null ? null : sha256CanonicalJson(requirements),
      }
    : null;

  const requestPayloadCanonicalSha256 = payloadPresent
    ? sha256CanonicalJson(requestPayload)
    : null;

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
      },
      provenance: provenance(
        PROVENANCE.LOCAL_DERIVED,
        "bound from Workflow Observatory observation pack"
      ),
    },
    workflow: {
      descriptorPresent: Boolean(selected),
      requestedOfferingName: offeringName,
      selectedDescriptorRef,
      provenance: selected
        ? provenance(
            PROVENANCE.LOCAL_DERIVED,
            "selected by exact offering name and bound by canonical digest"
          )
        : provenance(
            PROVENANCE.UNKNOWN,
            "requested offering name not observed in descriptor set"
          ),
    },
    request: {
      status: requestStatus,
      payloadPresent,
      requestPayloadCanonicalSha256,
      requirementsSchemaObserved: requirements !== null,
      schemaValidation,
      validationErrorCount,
      provenance: payloadPresent
        ? provenance(
            PROVENANCE.LOCAL_DERIVED,
            "candidate payload bound by canonical digest; raw payload remains outside PayGod input"
          )
        : provenance(PROVENANCE.UNKNOWN, "no request payload supplied"),
    },
    evidenceAdmission: {
      rawDescriptorAdmittedToPayGod: false,
      rawRequestPayloadAdmittedToPayGod: false,
      reason:
        "External ACP descriptor/request payload remain in the Observation Pack; PayGod receives digest-bound admission metadata only.",
    },
    authority: {
      acpJobCreationAuthorized: false,
      acpFundingAuthorized: false,
      acpSigningAuthorized: false,
      acpExecutionAuthorized: false,
      paygodMode: "shadow-only",
    },
    trust: {
      sourceAuthenticity: "UNKNOWN",
      sourceTruth: "UNKNOWN",
      independentTimeAuthority: "UNKNOWN",
      requestSchemaCorrectness:
        schemaValidation === "LOCAL_VALIDATED"
          ? "LOCAL_VALIDATED_NOT_ACP_ACCEPTANCE"
          : "NOT_VALIDATED",
    },
  };
}

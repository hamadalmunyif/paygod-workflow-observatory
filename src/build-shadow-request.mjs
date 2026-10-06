import { PROVENANCE, provenance } from "./provenance.mjs";

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

  const requestStatus = !selected
    ? "WITHHELD_NO_DESCRIPTOR"
    : !payloadPresent
      ? "WITHHELD_NO_PAYLOAD"
      : "CANDIDATE_UNVALIDATED";

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
      selectedDescriptor: selected,
      provenance: selected
        ? provenance(
            PROVENANCE.LOCAL_DERIVED,
            "selected by exact offering name from normalized descriptor set"
          )
        : provenance(
            PROVENANCE.UNKNOWN,
            "requested offering name not observed in descriptor set"
          ),
    },
    request: {
      status: requestStatus,
      payloadPresent,
      payload: requestPayload,
      requirementsSchema: selected?.requestContract?.requirements ?? null,
      schemaValidation: "NOT_RUN",
      provenance: payloadPresent
        ? provenance(
            PROVENANCE.LOCAL_DERIVED,
            "candidate payload supplied to internal shadow harness"
          )
        : provenance(PROVENANCE.UNKNOWN, "no request payload supplied"),
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
      requestSchemaCorrectness: "NOT_VALIDATED",
    },
  };
}

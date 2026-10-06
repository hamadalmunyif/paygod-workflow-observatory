import { PROVENANCE, provenance } from "./provenance.mjs";

export function normalizeBrowse(payload, { query = null } = {}) {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const descriptors = [];

  for (const agent of data) {
    const identity = {
      agentId: agent?.id ?? null,
      agentName: agent?.name ?? null,
      walletAddress: agent?.walletAddress ?? null,
      chains: Array.isArray(agent?.chains)
        ? agent.chains.map((ch) => ch?.chainId).filter((x) => x !== undefined)
        : [],
    };

    for (const offering of Array.isArray(agent?.offerings) ? agent.offerings : []) {
      descriptors.push({
        kind: "workflow-descriptor",
        descriptorType: "offering",
        identity,
        capability: {
          id: offering?.id ?? null,
          name: offering?.name ?? null,
          description: offering?.description ?? null,
        },
        requestContract: {
          requirements: offering?.requirements ?? null,
          provenance: provenance(PROVENANCE.RAW_REMOTE, "acp.browse.offerings.requirements"),
        },
        expectedOutput: {
          deliverable: offering?.deliverable ?? null,
          provenance: provenance(PROVENANCE.RAW_REMOTE, "acp.browse.offerings.deliverable"),
        },
        constraints: { slaMinutes: offering?.slaMinutes ?? null },
        economicTerms: {
          priceType: offering?.priceType ?? null,
          priceValue: offering?.priceValue ?? null,
          requiredFunds: offering?.requiredFunds ?? null,
        },
        provenance: provenance(PROVENANCE.LOCAL_DERIVED, "normalized from acp browse JSON"),
      });
    }

    for (const resource of Array.isArray(agent?.resources) ? agent.resources : []) {
      descriptors.push({
        kind: "workflow-descriptor",
        descriptorType: "resource",
        identity,
        capability: {
          id: resource?.id ?? null,
          name: resource?.name ?? null,
          description: resource?.description ?? null,
          url: resource?.url ?? null,
        },
        requestContract: {
          params: resource?.params ?? null,
          provenance: provenance(PROVENANCE.RAW_REMOTE, "acp.browse.resources.params"),
        },
        expectedOutput: {
          value: null,
          provenance: provenance(PROVENANCE.UNKNOWN, "resource execution is outside observed acp-cli JSON"),
        },
        constraints: {},
        economicTerms: null,
        provenance: provenance(PROVENANCE.LOCAL_DERIVED, "normalized from acp browse JSON"),
      });
    }
  }

  return {
    kind: "workflow-descriptor-set",
    query,
    descriptorCount: descriptors.length,
    descriptors,
    provenance: provenance(PROVENANCE.LOCAL_DERIVED, "descriptor set normalized from saved acp browse JSON"),
    sourceObservation: provenance(PROVENANCE.RAW_REMOTE, "saved acp browse JSON"),
  };
}

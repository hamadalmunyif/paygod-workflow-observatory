import { PROVENANCE, provenance } from "./provenance.mjs";

const EVENT_TO_STATUS = Object.freeze({
  "job.created": "open",
  "budget.set": "budget_set",
  "job.funded": "funded",
  "job.submitted": "submitted",
  "job.completed": "completed",
  "job.rejected": "rejected",
  "job.expired": "expired",
});

function asObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function deriveState(entries) {
  if (!Array.isArray(entries)) return null;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = asObject(entries[i]);
    if (!entry || entry.kind !== "system") continue;
    const event = asObject(entry.event);
    const mapped = typeof event?.type === "string" ? EVENT_TO_STATUS[event.type] : undefined;
    if (mapped) return mapped;
  }
  return null;
}

export function findRequirementEntry(entries) {
  if (!Array.isArray(entries)) return null;
  for (const raw of entries) {
    const entry = asObject(raw);
    if (!entry || entry.kind === "system") continue;
    if (entry.contentType === "requirement") return entry;
  }
  return null;
}

export function parseRequirementContent(content) {
  if (typeof content !== "string") {
    return {
      value: content ?? null,
      provenance: provenance(PROVENANCE.RAW_REMOTE, "raw requirement entry content"),
    };
  }
  try {
    return {
      value: JSON.parse(content),
      provenance: provenance(PROVENANCE.LOCAL_DERIVED, "JSON parsed locally from raw requirement entry content"),
    };
  } catch {
    return {
      value: content,
      provenance: provenance(PROVENANCE.RAW_REMOTE, "raw requirement entry content"),
    };
  }
}

export function normalizeHistory(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const state = deriveState(entries);
  const requirementEntry = findRequirementEntry(entries);
  const parsed = requirementEntry ? parseRequirementContent(requirementEntry.content) : null;
  const terminal = ["completed", "rejected", "expired"].includes(state) ? state : null;

  return {
    kind: "workflow-instance",
    identity: {
      system: "acp",
      protocol: payload?.protocol ?? "v2",
      jobId: payload?.jobId ?? null,
      chainId: payload?.chainId ?? null,
    },
    request: requirementEntry
      ? {
          inputs: parsed.value,
          inputsProvenance: parsed.provenance,
          rawEntry: requirementEntry,
          rawEntryProvenance: provenance(PROVENANCE.RAW_REMOTE, "saved acp job history requirement entry"),
        }
      : {
          inputs: null,
          inputsProvenance: provenance(PROVENANCE.UNKNOWN, "no requirement entry observed in saved job history"),
          rawEntry: null,
          rawEntryProvenance: provenance(PROVENANCE.UNKNOWN, "no requirement entry observed in saved job history"),
        },
    context: {
      state,
      stateProvenance: state
        ? provenance(PROVENANCE.LOCAL_DERIVED, "latest recognized state-bearing system event")
        : provenance(PROVENANCE.UNKNOWN, "no recognized state-bearing system event"),
    },
    decision: {
      roles: null,
      availableActions: null,
      proposedAction: null,
      provenance: provenance(PROVENANCE.UNKNOWN, "saved job history alone does not expose live decision context"),
    },
    history: {
      entries,
      entryCount: entries.length,
      provenance: provenance(PROVENANCE.RAW_REMOTE, "saved acp job history JSON"),
    },
    outcome: {
      terminalState: terminal,
      provenance: state
        ? provenance(PROVENANCE.LOCAL_DERIVED, "terminal status projected from derived current state")
        : provenance(PROVENANCE.UNKNOWN, "no recognized state-bearing system event"),
    },
  };
}

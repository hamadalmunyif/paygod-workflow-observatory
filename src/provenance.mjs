export const PROVENANCE = Object.freeze({
  RAW_REMOTE: "RAW_REMOTE",
  SDK_DERIVED: "SDK_DERIVED",
  LOCAL_DERIVED: "LOCAL_DERIVED",
  UNKNOWN: "UNKNOWN",
});

export function provenance(classification, source) {
  if (!Object.values(PROVENANCE).includes(classification)) {
    throw new Error(`Invalid provenance classification: ${classification}`);
  }
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("Provenance source must be a non-empty string");
  }
  return { classification, source };
}

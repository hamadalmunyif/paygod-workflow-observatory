import { sha256Bytes, sha256CanonicalJson } from "./digest.mjs";

const SOURCE_BASELINE = Object.freeze({
  repository: "hamadalmunyif/acp-cli",
  commit: "9d2be827cc19e4ea2cecfff3896398607537ea3e",
  acpCliVersion: "1.0.40",
  acpNodeV2Version: "0.1.15",
});

export function buildObservationManifest({ mode, rawBytes, normalized, rawFile = "raw.json", normalizedFile = "normalized.json" }) {
  if (!Buffer.isBuffer(rawBytes)) throw new TypeError("rawBytes must be a Buffer");
  if (!["discover", "inspect"].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);

  const rawSha256 = sha256Bytes(rawBytes);
  const normalizedSha256 = sha256CanonicalJson(normalized);
  const requestEntry = mode === "inspect" ? normalized?.request?.rawEntry ?? null : null;

  return {
    schema: "workflow-observatory/observation-pack/v0",
    mode,
    source: {
      system: "acp-cli",
      baseline: SOURCE_BASELINE,
      file: rawFile,
      byteLength: rawBytes.length,
      sha256: rawSha256,
      provenance: "RAW_REMOTE",
    },
    normalized: {
      file: normalizedFile,
      canonicalSha256: normalizedSha256,
      provenance: "LOCAL_DERIVED",
    },
    bindings: {
      sourceToNormalized: {
        rawSha256,
        normalizedCanonicalSha256: normalizedSha256,
      },
      requestEntryCanonicalSha256: requestEntry ? sha256CanonicalJson(requestEntry) : null,
    },
    trust: {
      integrityWithinPack: "HASH_BOUND",
      sourceAuthenticity: "UNKNOWN",
      sourceTruth: "UNKNOWN",
      independentTimeAuthority: "UNKNOWN",
      decisionCorrectness: "UNKNOWN",
    },
  };
}

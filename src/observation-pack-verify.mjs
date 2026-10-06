import { sha256Bytes, sha256CanonicalJson } from "./digest.mjs";
import { normalizeBrowse } from "./normalize-browse.mjs";
import { normalizeHistory } from "./normalize-history.mjs";

export class ObservationPackVerificationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ObservationPackVerificationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ObservationPackVerificationError(code, message);
}

function requireEqual(actual, expected, code, label) {
  if (actual !== expected) {
    fail(code, `${label} mismatch`);
  }
}

function rederiveNormalized(manifest, rawPayload, normalized) {
  if (manifest.mode === "discover") {
    return normalizeBrowse(rawPayload, { query: normalized?.query ?? null });
  }
  if (manifest.mode === "inspect") {
    return normalizeHistory(rawPayload);
  }
  fail("PACK_MODE_UNSUPPORTED", `Unsupported observation mode: ${manifest.mode}`);
}

export function verifyObservationPack({
  rawBytes,
  normalized,
  manifest,
  expectedManifestCanonicalSha256 = null,
}) {
  if (!Buffer.isBuffer(rawBytes)) {
    fail("PACK_RAW_BYTES_REQUIRED", "rawBytes must be a Buffer");
  }
  if (!manifest || manifest.schema !== "workflow-observatory/observation-pack/v0") {
    fail("PACK_SCHEMA_UNSUPPORTED", "Unsupported or missing observation-pack schema");
  }

  const rawSha256 = sha256Bytes(rawBytes);
  const normalizedCanonicalSha256 = sha256CanonicalJson(normalized);

  requireEqual(
    rawSha256,
    manifest?.source?.sha256,
    "PACK_RAW_DIGEST_MISMATCH",
    "raw observation digest"
  );
  requireEqual(
    rawBytes.length,
    manifest?.source?.byteLength,
    "PACK_RAW_LENGTH_MISMATCH",
    "raw observation byte length"
  );
  requireEqual(
    rawSha256,
    manifest?.bindings?.sourceToNormalized?.rawSha256,
    "PACK_BINDING_RAW_DIGEST_MISMATCH",
    "manifest raw binding"
  );
  requireEqual(
    normalizedCanonicalSha256,
    manifest?.normalized?.canonicalSha256,
    "PACK_NORMALIZED_DIGEST_MISMATCH",
    "normalized observation digest"
  );
  requireEqual(
    normalizedCanonicalSha256,
    manifest?.bindings?.sourceToNormalized?.normalizedCanonicalSha256,
    "PACK_BINDING_NORMALIZED_DIGEST_MISMATCH",
    "manifest normalized binding"
  );

  let rawPayload;
  try {
    rawPayload = JSON.parse(rawBytes.toString("utf8"));
  } catch {
    fail("PACK_RAW_JSON_INVALID", "Raw observation is not valid JSON");
  }

  const rederived = rederiveNormalized(manifest, rawPayload, normalized);
  const rederivedCanonicalSha256 = sha256CanonicalJson(rederived);
  requireEqual(
    rederivedCanonicalSha256,
    normalizedCanonicalSha256,
    "PACK_DERIVATION_MISMATCH",
    "raw-to-normalized derivation"
  );

  const manifestCanonicalSha256 = sha256CanonicalJson(manifest);
  let externalAnchorStatus = "UNANCHORED";
  if (expectedManifestCanonicalSha256) {
    requireEqual(
      manifestCanonicalSha256,
      expectedManifestCanonicalSha256,
      "PACK_EXTERNAL_ANCHOR_MISMATCH",
      "external manifest anchor"
    );
    externalAnchorStatus = "MATCHED";
  }

  return {
    status: "VERIFIED",
    integrityWithinPack: "VERIFIED",
    derivation: "VERIFIED",
    rawSha256,
    normalizedCanonicalSha256,
    manifestCanonicalSha256,
    externalAnchorStatus,
    observationAuthenticity: "NOT_PROVEN",
  };
}

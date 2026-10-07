#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { normalizeBrowse } from "../src/normalize-browse.mjs";
import { buildObservationManifest } from "../src/observation-pack.mjs";
import { verifyObservationPack } from "../src/observation-pack-verify.mjs";
import {
  buildAttemptCommitment,
  buildRequestIdentityCommitment,
} from "../src/request-identity.mjs";
import { buildShadowRequest } from "../src/build-shadow-request.mjs";
import { sha256CanonicalJson } from "../src/digest.mjs";
import { canonicalJson } from "../src/canonical-json.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const sourceDir = argValue("--source-dir");
const outputDir = argValue("--output-dir");
const offeringName = argValue("--offering") ?? "getCongressTrades";

if (!sourceDir || !outputDir) {
  throw new Error(
    "Usage: witness-002b --source-dir <observation-pack-dir> --output-dir <dir> [--offering name]"
  );
}

const [rawBytes, normalized, manifest] = await Promise.all([
  fs.readFile(path.join(sourceDir, "raw.json")),
  fs.readFile(path.join(sourceDir, "normalized.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(sourceDir, "manifest.json"), "utf8").then(JSON.parse),
]);

const baselineVerification = verifyObservationPack({
  rawBytes,
  normalized,
  manifest,
});
const originalManifestAnchor = sha256CanonicalJson(manifest);

function offering(set, name = offeringName) {
  return set?.descriptors?.find(
    (item) =>
      item?.descriptorType === "offering" &&
      item?.capability?.name === name
  ) ?? null;
}

function payloadBytes(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8");
}

function freeze(set, payload, { attemptId = randomUUID(), bytes = payloadBytes(payload) } = {}) {
  const identity = buildRequestIdentityCommitment({
    selectedDescriptor: offering(set),
    requestPayload: payload,
    requestPayloadBytes: bytes,
  });
  return {
    ...identity,
    attempt: buildAttemptCommitment({
      attemptId,
      requestIdentitySha256: identity.submittedRequestIdentitySha256,
      observationManifestSha256: baselineVerification.manifestCanonicalSha256,
    }),
  };
}

function build(
  set,
  verification,
  payload,
  identity,
  name = offeringName,
  packManifest = manifest,
  bytes = payload === null ? null : payloadBytes(payload)
) {
  return buildShadowRequest({
    descriptorSet: set,
    observationManifest: packManifest,
    packVerification: verification,
    offeringName: name,
    requestPayload: payload,
    requestPayloadBytes: bytes,
    submittedRequestIdentity: identity,
  });
}

function clone(value) {
  return structuredClone(value);
}

function mutateRaw(mutator) {
  const payload = JSON.parse(rawBytes.toString("utf8"));
  const agent = payload?.data?.find((a) =>
    Array.isArray(a?.offerings) &&
    a.offerings.some((o) => o?.name === offeringName)
  );
  if (!agent) throw new Error(`Offering ${offeringName} not found in raw observation`);
  const target = agent.offerings.find((o) => o?.name === offeringName);
  mutator({ payload, agent, offering: target });
  const nextRawBytes = Buffer.from(JSON.stringify(payload));
  const nextNormalized = normalizeBrowse(payload, { query: normalized?.query ?? null });
  const nextManifest = buildObservationManifest({
    mode: "discover",
    rawBytes: nextRawBytes,
    normalized: nextNormalized,
  });
  const verification = verifyObservationPack({
    rawBytes: nextRawBytes,
    normalized: nextNormalized,
    manifest: nextManifest,
  });
  return {
    rawBytes: nextRawBytes,
    normalized: nextNormalized,
    manifest: nextManifest,
    verification,
  };
}

const cases = [];
function record(id, layer, expectedCode, fn) {
  let observedCode = null;
  let detail = null;
  try {
    const result = fn();
    observedCode =
      result?.request?.decisionReasonCode ??
      result?.code ??
      result?.observedCode ??
      "NO_CODE";
    detail = result?.detail ?? null;
  } catch (err) {
    observedCode = err?.code ?? "UNEXPECTED_EXCEPTION";
    detail = err instanceof Error ? err.message : String(err);
  }

  const passed = observedCode === expectedCode;
  const row = { id, layer, expectedCode, observedCode, passed, detail };
  cases.push(row);
  if (!passed) {
    throw new Error(
      `${id}: expected ${expectedCode}, observed ${observedCode}`
    );
  }
}

const validPayload = { limit: 5 };
const validIdentity = freeze(normalized, validPayload, {
  attemptId: "002b-valid-attempt",
});

record("002b-01-valid-request", "admission", "ADMISSION_LOCAL_VALIDATED", () =>
  build(normalized, baselineVerification, validPayload, validIdentity)
);

record("002b-02-limit-over-maximum", "schema", "SCHEMA_MAXIMUM", () => {
  const payload = { limit: 5000 };
  return build(
    normalized,
    baselineVerification,
    payload,
    freeze(normalized, payload, { attemptId: "002b-schema-max" })
  );
});

record("002b-03-limit-wrong-type", "schema", "SCHEMA_TYPE_MISMATCH", () => {
  const payload = { limit: "5" };
  return build(
    normalized,
    baselineVerification,
    payload,
    freeze(normalized, payload, { attemptId: "002b-schema-type" })
  );
});

record("002b-04-payload-missing", "admission", "ADMISSION_PAYLOAD_MISSING", () =>
  build(normalized, baselineVerification, null, null)
);

record("002b-05-descriptor-missing", "admission", "ADMISSION_DESCRIPTOR_NOT_FOUND", () =>
  build(normalized, baselineVerification, null, null, "__missing_offering__")
);

record("002b-06-normalized-stale-manifest", "pack", "PACK_NORMALIZED_DIGEST_MISMATCH", () => {
  const changed = clone(normalized);
  changed.query = "__tampered_query__";
  verifyObservationPack({ rawBytes, normalized: changed, manifest });
  return { observedCode: "UNEXPECTED_PASS" };
});

record("002b-07-normalized-and-manifest-recomputed", "pack", "PACK_DERIVATION_MISMATCH", () => {
  const changed = clone(normalized);
  changed.query = "__tampered_query__";
  const changedManifest = buildObservationManifest({
    mode: "discover",
    rawBytes,
    normalized: changed,
  });
  verifyObservationPack({
    rawBytes,
    normalized: changed,
    manifest: changedManifest,
  });
  return { observedCode: "UNEXPECTED_PASS" };
});

record("002b-08-whole-pack-coherent-rewrite", "trust-boundary", "CONSISTENT_UNANCHORED", () => {
  const changed = mutateRaw(({ agent }) => {
    agent.name = `${agent.name ?? "agent"}-rewritten`;
  });
  if (changed.verification.externalAnchorStatus !== "UNANCHORED") {
    return { observedCode: "UNEXPECTED_ANCHOR_STATUS" };
  }
  return {
    observedCode: "CONSISTENT_UNANCHORED",
    detail:
      "Raw, normalized, and manifest were coherently rewritten. Internal consistency passes; observation authenticity remains unproven without an external anchor.",
  };
});

record("002b-09-whole-pack-rewrite-against-anchor", "external-anchor", "PACK_EXTERNAL_ANCHOR_MISMATCH", () => {
  const changed = mutateRaw(({ agent }) => {
    agent.name = `${agent.name ?? "agent"}-rewritten-anchor-test`;
  });
  verifyObservationPack({
    rawBytes: changed.rawBytes,
    normalized: changed.normalized,
    manifest: changed.manifest,
    expectedManifestCanonicalSha256: originalManifestAnchor,
  });
  return { observedCode: "UNEXPECTED_PASS" };
});

record("002b-10-payload-mutated-after-freeze", "request", "REQUEST_PAYLOAD_DIGEST_MISMATCH", () =>
  build(normalized, baselineVerification, { limit: 6 }, validIdentity)
);

record("002b-11-requirements-mutated-after-freeze", "contract", "REQUEST_REQUIREMENTS_DIGEST_MISMATCH", () => {
  const changed = mutateRaw(({ offering: rawOffering }) => {
    rawOffering.requirements = clone(rawOffering.requirements ?? {});
    if (rawOffering.requirements?.properties?.limit) {
      rawOffering.requirements.properties.limit.maximum = 999;
    }
  });
  return build(
    changed.normalized,
    changed.verification,
    validPayload,
    validIdentity,
    offeringName,
    changed.manifest
  );
});

record("002b-12-descriptor-mutated-after-freeze", "descriptor", "REQUEST_DESCRIPTOR_DIGEST_MISMATCH", () => {
  const changed = mutateRaw(({ offering: rawOffering }) => {
    rawOffering.description = `${rawOffering.description ?? ""} [rewritten]`;
  });
  return build(
    changed.normalized,
    changed.verification,
    validPayload,
    validIdentity,
    offeringName,
    changed.manifest
  );
});

record("002b-13-capability-identity-mutated", "descriptor", "REQUEST_CAPABILITY_MISMATCH", () => {
  const changed = mutateRaw(({ offering: rawOffering }) => {
    rawOffering.id = `${rawOffering.id ?? "offering"}-rewritten`;
  });
  return build(
    changed.normalized,
    changed.verification,
    validPayload,
    validIdentity,
    offeringName,
    changed.manifest
  );
});

record("002b-14-multifault-pack-before-request", "precedence", "PACK_NORMALIZED_DIGEST_MISMATCH", () => {
  const changed = clone(normalized);
  changed.query = "__tampered_query__";
  verifyObservationPack({ rawBytes, normalized: changed, manifest });

  const payload = { limit: 5000 };
  return build(
    changed,
    baselineVerification,
    payload,
    freeze(normalized, payload, { attemptId: "002b-multifault-pack" })
  );
});

record("002b-15-multifault-contract-before-request", "precedence", "REQUEST_REQUIREMENTS_DIGEST_MISMATCH", () => {
  const changed = mutateRaw(({ offering: rawOffering }) => {
    rawOffering.requirements = clone(rawOffering.requirements ?? {});
    if (rawOffering.requirements?.properties?.limit) {
      rawOffering.requirements.properties.limit.maximum = 999;
    }
  });
  return build(
    changed.normalized,
    changed.verification,
    { limit: 6 },
    validIdentity,
    offeringName,
    changed.manifest
  );
});

record("002b-16-multifault-descriptor-before-request", "precedence", "REQUEST_DESCRIPTOR_DIGEST_MISMATCH", () => {
  const changed = mutateRaw(({ offering: rawOffering }) => {
    rawOffering.description = `${rawOffering.description ?? ""} [multifault]`;
  });
  return build(
    changed.normalized,
    changed.verification,
    { limit: 6 },
    validIdentity,
    offeringName,
    changed.manifest
  );
});

record("002b-17-multifault-request-before-schema-result", "precedence", "REQUEST_PAYLOAD_DIGEST_MISMATCH", () =>
  build(
    normalized,
    baselineVerification,
    { limit: 5000 },
    validIdentity
  )
);

record("002b-18-producer-trust-claim-ignored", "trust-boundary", "VERIFIER_DERIVED_UNANCHORED", () => {
  const claimedManifest = clone(manifest);
  claimedManifest.trust = {
    ...(claimedManifest.trust ?? {}),
    externalAnchorStatus: "MATCHED",
    observationAuthenticity: "PROVEN",
  };
  const verification = verifyObservationPack({
    rawBytes,
    normalized,
    manifest: claimedManifest,
  });
  if (
    verification.externalAnchorStatus === "UNANCHORED" &&
    verification.observationAuthenticity === "NOT_PROVEN"
  ) {
    return {
      observedCode: "VERIFIER_DERIVED_UNANCHORED",
      detail:
        "Producer-written trust claims did not upgrade verifier-derived anchor/authenticity state.",
    };
  }
  return { observedCode: "UNEXPECTED_TRUST_UPGRADE" };
});

const summary = {
  witness: "ACP-PAYGOD-ADVERSARIAL-002B",
  sourceObservation: {
    rawSha256: baselineVerification.rawSha256,
    normalizedCanonicalSha256: baselineVerification.normalizedCanonicalSha256,
    manifestCanonicalSha256: baselineVerification.manifestCanonicalSha256,
    externalAnchorStatus: baselineVerification.externalAnchorStatus,
    observationAuthenticity: baselineVerification.observationAuthenticity,
  },
  requestIdentityProfile: "workflow-observatory/request-identity/v0",
  requestIdentityByteProfile: validIdentity.byteProfile,
  submittedRequestIdentitySha256:
    validIdentity.submittedRequestIdentitySha256,
  attemptSemantics: {
    attemptId: validIdentity.attempt.attempt_id,
    attemptCommitmentSha256:
      validIdentity.attempt.attempt_commitment_sha256,
    releaseNoncePresent: false,
  },
  rejectionPrecedence: [
    "PACK",
    "CONTRACT/DESCRIPTOR",
    "REQUEST",
    "POLICY",
  ],
  remoteBindingGrade: "NOT_TESTED",
  allExpectedCodesObserved: cases.every((row) => row.passed),
  cases,
  trustBoundaryFinding:
    "A coherent rewrite of raw + normalized + manifest passes internal verification when no external manifest anchor is supplied. Producer-written trust claims cannot upgrade verifier-derived trust state.",
};

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(
  path.join(outputDir, "matrix.json"),
  canonicalJson(summary) + "\n",
  "utf8"
);
await fs.writeFile(
  path.join(outputDir, "valid-request-identity.json"),
  canonicalJson(validIdentity) + "\n",
  "utf8"
);

console.log(JSON.stringify(summary, null, 2));

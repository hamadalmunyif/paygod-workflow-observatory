#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { verifyObservationPack } from "../src/observation-pack-verify.mjs";
import {
  buildAttemptCommitment,
  buildRequestIdentityCommitment,
  requestArtifactBytes,
} from "../src/request-identity.mjs";
import { canonicalJson } from "../src/canonical-json.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const rawPath = argValue("--raw");
const normalizedPath = argValue("--normalized");
const manifestPath = argValue("--manifest");
const offeringName = argValue("--offering");
const outputPath = argValue("--output");

if (!rawPath || !normalizedPath || !manifestPath || !offeringName || !outputPath) {
  throw new Error(
    "Usage: freeze-request-identity --raw <raw.json> --normalized <normalized.json> --manifest <manifest.json> --offering <name> --output <file>"
  );
}

const [rawBytes, descriptorSet, manifest] = await Promise.all([
  fs.readFile(rawPath),
  fs.readFile(normalizedPath, "utf8").then(JSON.parse),
  fs.readFile(manifestPath, "utf8").then(JSON.parse),
]);

const packVerification = verifyObservationPack({
  rawBytes,
  normalized: descriptorSet,
  manifest,
});

const rawRequest = process.env.REQUEST_JSON ?? "";
if (!rawRequest.trim()) {
  throw new Error("REQUEST_JSON is required to freeze request identity");
}
const requestPayload = JSON.parse(rawRequest);
const requestPayloadBytes = Buffer.from(rawRequest, "utf8");

const selected = Array.isArray(descriptorSet?.descriptors)
  ? descriptorSet.descriptors.find(
      (item) =>
        item?.descriptorType === "offering" &&
        item?.capability?.name === offeringName
    ) ?? null
  : null;

const identity = buildRequestIdentityCommitment({
  selectedDescriptor: selected,
  requestPayload,
  requestPayloadBytes,
});

const frozenBytes = requestArtifactBytes({
  selectedDescriptor: selected,
  requestPayload,
  requestPayloadBytes,
});

const attempt = buildAttemptCommitment({
  attemptId: randomUUID(),
  requestIdentitySha256: identity.submittedRequestIdentitySha256,
  observationManifestSha256: packVerification.manifestCanonicalSha256,
});

const artifactDir =
  outputPath.endsWith(".json")
    ? `${outputPath.slice(0, -5)}.artifacts`
    : `${outputPath}.artifacts`;
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(artifactDir, { recursive: true });

const descriptorFile = path.join(artifactDir, "descriptor.json");
const requirementsFile = path.join(artifactDir, "requirements.json");
const payloadFile = path.join(artifactDir, "request-payload.json");

await fs.writeFile(descriptorFile, frozenBytes.descriptorBytes);
if (frozenBytes.requirementsBytes !== null) {
  await fs.writeFile(requirementsFile, frozenBytes.requirementsBytes);
}
await fs.writeFile(payloadFile, frozenBytes.requestPayloadBytes);

const artifactRootName = path.basename(artifactDir);
const artifact = {
  ...identity,
  status: "FROZEN_LOCAL",
  offeringName,
  attempt,
  packBinding: {
    manifestCanonicalSha256: packVerification.manifestCanonicalSha256,
    normalizedCanonicalSha256: packVerification.normalizedCanonicalSha256,
  },
  artifacts: {
    descriptor: {
      file: `${artifactRootName}/descriptor.json`,
      sha256: identity.commitment.descriptorArtifactSha256,
      byteLength: identity.artifactByteLengths.descriptor,
    },
    requirements:
      frozenBytes.requirementsBytes === null
        ? null
        : {
            file: `${artifactRootName}/requirements.json`,
            sha256: identity.commitment.requirementsArtifactSha256,
            byteLength: identity.artifactByteLengths.requirements,
          },
    requestPayload: {
      file: `${artifactRootName}/request-payload.json`,
      sha256: identity.commitment.requestPayloadArtifactSha256,
      byteLength: identity.artifactByteLengths.requestPayload,
    },
  },
};

await fs.writeFile(outputPath, canonicalJson(artifact) + "\n", "utf8");

console.log(`Frozen request identity written: ${outputPath}`);
console.log(`Request identity: ${artifact.submittedRequestIdentitySha256}`);
console.log(`Attempt id: ${artifact.attempt.attempt_id}`);
console.log(`Attempt commitment: ${artifact.attempt.attempt_commitment_sha256}`);
console.log(`External manifest anchor (recomputed now): ${packVerification.externalAnchorStatus}`);

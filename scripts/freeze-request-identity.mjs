#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { verifyObservationPack } from "../src/observation-pack-verify.mjs";
import { buildRequestIdentityCommitment } from "../src/request-identity.mjs";
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

const rawRequest = (process.env.REQUEST_JSON ?? "").trim();
if (!rawRequest) throw new Error("REQUEST_JSON is required to freeze request identity");
const requestPayload = JSON.parse(rawRequest);

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
});

const artifact = {
  ...identity,
  status: "FROZEN_LOCAL",
  offeringName,
  packBinding: {
    manifestCanonicalSha256: packVerification.manifestCanonicalSha256,
    normalizedCanonicalSha256: packVerification.normalizedCanonicalSha256,
    externalAnchorStatus: packVerification.externalAnchorStatus,
  },
  trust: {
    observationAuthenticity: "NOT_PROVEN",
    externalManifestAnchor: packVerification.externalAnchorStatus,
  },
};

await fs.writeFile(outputPath, canonicalJson(artifact) + "\n", "utf8");

console.log(`Frozen request identity written: ${outputPath}`);
console.log(`Request identity: ${artifact.submittedRequestIdentitySha256}`);
console.log(`External manifest anchor: ${artifact.packBinding.externalAnchorStatus}`);

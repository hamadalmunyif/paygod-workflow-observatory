#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { buildShadowRequest } from "../src/build-shadow-request.mjs";
import { canonicalJson } from "../src/canonical-json.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const normalizedPath = argValue("--normalized");
const manifestPath = argValue("--manifest");
const offeringName = argValue("--offering");
const outputPath = argValue("--output");

if (!normalizedPath || !manifestPath || !offeringName || !outputPath) {
  throw new Error(
    "Usage: build-shadow-request --normalized <normalized.json> --manifest <manifest.json> --offering <name> --output <file>"
  );
}

const [descriptorSet, manifest] = await Promise.all([
  fs.readFile(normalizedPath, "utf8").then(JSON.parse),
  fs.readFile(manifestPath, "utf8").then(JSON.parse),
]);

const rawRequest = (process.env.REQUEST_JSON ?? "").trim();
const requestPayload = rawRequest ? JSON.parse(rawRequest) : null;

const result = buildShadowRequest({
  descriptorSet,
  observationManifest: manifest,
  offeringName,
  requestPayload,
});

await fs.writeFile(outputPath, canonicalJson(result) + "\n", "utf8");

console.log(`Shadow request written: ${outputPath}`);
console.log(`Status: ${result.request.status}`);
console.log(`Descriptor present: ${result.workflow.descriptorPresent}`);
console.log(`Payload present: ${result.request.payloadPresent}`);
console.log("ACP execution authority: false");

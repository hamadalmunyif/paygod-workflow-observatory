#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { buildShadowRequest } from "../src/build-shadow-request.mjs";
import { verifyObservationPack } from "../src/observation-pack-verify.mjs";
import { canonicalJson } from "../src/canonical-json.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const rawPath = argValue("--raw");
const normalizedPath = argValue("--normalized");
const manifestPath = argValue("--manifest");
const requestIdentityPath = argValue("--request-identity");
const offeringName = argValue("--offering");
const outputPath = argValue("--output");

if (!rawPath || !normalizedPath || !manifestPath || !offeringName || !outputPath) {
  throw new Error(
    "Usage: build-shadow-request --raw <raw.json> --normalized <normalized.json> --manifest <manifest.json> [--request-identity <request-identity.json>] --offering <name> --output <file>"
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
const requestPayload = rawRequest.trim() ? JSON.parse(rawRequest) : null;
const requestPayloadBytes =
  requestPayload === null ? null : Buffer.from(rawRequest, "utf8");
const submittedRequestIdentity = requestIdentityPath
  ? await fs.readFile(requestIdentityPath, "utf8").then(JSON.parse)
  : null;

const result = buildShadowRequest({
  descriptorSet,
  observationManifest: manifest,
  packVerification,
  offeringName,
  requestPayload,
  requestPayloadBytes,
  submittedRequestIdentity,
});

await fs.writeFile(outputPath, canonicalJson(result) + "\n", "utf8");

console.log(`Shadow request written: ${outputPath}`);
console.log(`Status: ${result.request.status}`);
console.log(`Reason code: ${result.request.decisionReasonCode}`);
console.log(`Descriptor present: ${result.workflow.descriptorPresent}`);
console.log(`Payload present: ${result.request.payloadPresent}`);
console.log(`Observation pack: ${result.source.packVerification.status}`);
console.log(`External manifest anchor: ${result.source.packVerification.externalAnchorStatus}`);
console.log(`Attempt id: ${result.request.attemptId ?? "none"}`);
console.log("ACP execution authority: false");

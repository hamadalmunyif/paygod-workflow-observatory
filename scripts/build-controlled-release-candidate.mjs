#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { buildControlledReleaseCandidateV0 } from "../src/controlled-release-candidate-v0.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const requestShadowPath = argValue("--request-shadow");
const transitionEnvelopePath = argValue("--transition-envelope");
const outputPath = argValue("--output");

if (!requestShadowPath || !transitionEnvelopePath || !outputPath) {
  throw new Error(
    "Usage: build-controlled-release-candidate --request-shadow <json> --transition-envelope <json> --output <json>"
  );
}

const [requestShadow, transitionEnvelopeBytes] = await Promise.all([
  fs.readFile(requestShadowPath, "utf8").then(JSON.parse),
  fs.readFile(transitionEnvelopePath),
]);

const result = buildControlledReleaseCandidateV0({
  requestShadow,
  transitionEnvelopeBytes,
});

await fs.writeFile(outputPath, result.bytes);

console.log("Controlled release candidate written: " + outputPath);
console.log("Request identity: " + result.admittedRequestIdentitySha256);
console.log("Transition commitment: " + result.transitionCommitment);
console.log("External execution authority: false");

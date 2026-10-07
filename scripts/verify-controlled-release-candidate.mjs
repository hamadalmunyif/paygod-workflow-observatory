#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { verifyControlledReleaseCandidateV0 } from "../src/controlled-release-candidate-v0.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const requestShadowPath = argValue("--request-shadow");
const transitionEnvelopePath = argValue("--transition-envelope");
const candidatePath = argValue("--candidate");
const admissionReceiptPath = argValue("--admission-receipt");

if (!requestShadowPath || !transitionEnvelopePath || !candidatePath || !admissionReceiptPath) {
  throw new Error(
    "Usage: verify-controlled-release-candidate --request-shadow <json> --transition-envelope <json> --admission-receipt <receipt.json> --candidate <json>"
  );
}

const [requestShadow, transitionEnvelopeBytes, candidateBytes, admissionReceiptBytes] = await Promise.all([
  fs.readFile(requestShadowPath, "utf8").then(JSON.parse),
  fs.readFile(transitionEnvelopePath),
  fs.readFile(candidatePath),
  fs.readFile(admissionReceiptPath),
]);

const result = verifyControlledReleaseCandidateV0({
  candidateBytes,
  requestShadow,
  transitionEnvelopeBytes,
  admissionReceiptBytes,
});

console.log("Status: " + result.status);
console.log("Request identity: " + result.admittedRequestIdentitySha256);
console.log("Transition commitment: " + result.transitionCommitment);
console.log("Admission receipt SHA-256: " + result.admissionReceiptSha256);
console.log("External execution authority: false");

#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { sha256Bytes } from "../src/digest.mjs";
import { buildTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const requestShadowPath = argValue("--request-shadow");
const outputPath = argValue("--output");

if (!requestShadowPath || !outputPath) {
  throw new Error(
    "Usage: build-controlled-transition-fixture --request-shadow <json> --output <json>"
  );
}

const requestShadow = JSON.parse(await fs.readFile(requestShadowPath, "utf8"));
const requestIdentity = requestShadow?.request?.admittedRequestIdentitySha256;
const payloadSha256 = requestShadow?.request?.requestPayloadArtifactSha256;

if (!requestIdentity || !payloadSha256) {
  throw new Error("Request shadow must contain admitted request identity and payload digest");
}

const calldataBytes = Buffer.from(
  "controlled-harness:createJob:fixture-v0",
  "utf8"
);

const result = buildTransitionEnvelopeV0({
  requestIdentitySha256: requestIdentity,
  transaction: {
    system: "evm",
    chainId: 31337,
    executionAccount: "0x1111111111111111111111111111111111111111",
    target: "0x2222222222222222222222222222222222222222",
    calldataSha256: sha256Bytes(calldataBytes),
    nativeValue: "0",
  },
  payload: {
    channel: "controlled-requirement-message/v0",
    recipient: "0x3333333333333333333333333333333333333333",
    contentType: "requirement",
    payloadSha256,
  },
});

await fs.writeFile(outputPath, result.bytes);
console.log("Controlled transition fixture written: " + outputPath);
console.log("Transition commitment: " + result.transitionCommitment);
console.log("EVM transaction submitted: false");

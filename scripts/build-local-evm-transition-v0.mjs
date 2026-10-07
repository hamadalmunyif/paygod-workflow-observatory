#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

import { sha256Bytes } from "../src/digest.mjs";
import { buildTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error("Missing required argument: " + name);
  return value;
}

function requireAddress(value, label) {
  if (!/^0x[0-9a-f]{40}$/.test(value)) {
    throw new Error(label + " must be a lowercase EVM address");
  }
  return value;
}

function parseCalldataHex(text) {
  const value = text.trim();
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new Error("calldata hex must be 0x-prefixed whole bytes");
  }
  const bytes = Buffer.from(value.slice(2), "hex");
  if ("0x" + bytes.toString("hex") !== value.toLowerCase()) {
    throw new Error("calldata hex round-trip mismatch");
  }
  return { bytes, hex: value.toLowerCase() };
}

const requestShadowPath = requiredArg("--request-shadow");
const executionAccount = requireAddress(
  requiredArg("--execution-account"),
  "execution account"
);
const target = requireAddress(requiredArg("--target"), "target");
const payloadRecipient = requireAddress(
  requiredArg("--payload-recipient"),
  "payload recipient"
);
const calldataHexPath = requiredArg("--calldata-hex");
const outputPath = requiredArg("--output");
const proposalOutputPath = requiredArg("--proposal-output");

const [requestShadow, calldataText] = await Promise.all([
  fs.readFile(requestShadowPath, "utf8").then(JSON.parse),
  fs.readFile(calldataHexPath, "utf8"),
]);

const requestIdentity = requestShadow?.request?.admittedRequestIdentitySha256;
const payloadSha256 = requestShadow?.request?.requestPayloadArtifactSha256;

if (!requestIdentity || !payloadSha256) {
  throw new Error(
    "Request shadow must contain admitted request identity and payload digest"
  );
}

const calldata = parseCalldataHex(calldataText);

const result = buildTransitionEnvelopeV0({
  requestIdentitySha256: requestIdentity,
  transaction: {
    system: "evm",
    chainId: 31337,
    executionAccount,
    target,
    calldataSha256: sha256Bytes(calldata.bytes),
    nativeValue: "0",
  },
  payload: {
    channel: "controlled-requirement-message/v0",
    recipient: payloadRecipient,
    contentType: "requirement",
    payloadSha256,
  },
});

const proposal = {
  schema: "workflow-observatory/local-evm-transaction-proposal/v0",
  system: "evm",
  chain_id: 31337,
  execution_account: executionAccount,
  target,
  calldata_hex: calldata.hex,
  calldata_sha256: sha256Bytes(calldata.bytes),
  native_value: "0",
};

await Promise.all([
  fs.writeFile(outputPath, result.bytes),
  fs.writeFile(
    proposalOutputPath,
    JSON.stringify(proposal, null, 2) + "\n",
    "utf8"
  ),
]);

console.log("Local EVM Transition Envelope written: " + outputPath);
console.log("Transaction proposal written: " + proposalOutputPath);
console.log("Transition commitment: " + result.transitionCommitment);
console.log("Calldata SHA-256: " + proposal.calldata_sha256);

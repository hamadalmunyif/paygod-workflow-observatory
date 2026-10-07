#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { stagePayloadThroughE2V0 } from "../src/e2-payload-gate-v0.mjs";
import { trustedWarrantIssuersFromExternalTrustV0 } from "../src/warrant-issuer-trust-v0.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

const warrantBodyPath = requiredArg("--warrant-body");
const warrantSignaturePath = requiredArg("--warrant-signature");
const warrantTrustStorePath = requiredArg("--warrant-trust-store");
const transitionEnvelopePath = requiredArg("--transition-envelope");
const payloadPath = requiredArg("--payload");
const payloadChannel = requiredArg("--payload-channel");
const payloadRecipient = requiredArg("--payload-recipient");
const payloadContentType = requiredArg("--payload-content-type");
const stateDbPath = requiredArg("--state-db");
const outputDir = requiredArg("--output-dir");

await fs.mkdir(outputDir, { recursive: true });

const [
  warrantBodyBytes,
  warrantSignatureBytes,
  warrantTrustStoreBytes,
  transitionEnvelopeBytes,
  payloadBytes,
] = await Promise.all([
  fs.readFile(warrantBodyPath),
  fs.readFile(warrantSignaturePath),
  fs.readFile(warrantTrustStorePath),
  fs.readFile(transitionEnvelopePath),
  fs.readFile(payloadPath),
]);

let warrantTrustStore;
try {
  warrantTrustStore = JSON.parse(warrantTrustStoreBytes.toString("utf8"));
} catch {
  throw new Error("Warrant issuer trust store is not valid JSON");
}

const trusted = trustedWarrantIssuersFromExternalTrustV0({
  trustStore: warrantTrustStore,
  trustStoreBytes: warrantTrustStoreBytes,
});

const store = await openAuthorityStateStoreV0(stateDbPath);
try {
  const result = stagePayloadThroughE2V0({
    warrantBodyBytes,
    warrantSignatureBytes,
    trustedWarrantIssuers: trusted.trustedIssuers,
    transitionEnvelopeBytes,
    payloadBytes,
    payloadChannel,
    payloadRecipient,
    payloadContentType,
    authorityStateStore: store,
    expectedDomain: trusted.enforcementDomain,
  });

  const stage = store.getStagedPayload({
    issuerKeyId: result.warrantIssuerKeyId,
    nonce: result.nonce,
  });
  if (!stage || !Buffer.isBuffer(stage.payloadBytes)) {
    throw new Error("S0 did not persist exact staged payload bytes");
  }
  if (!stage.payloadBytes.equals(payloadBytes)) {
    throw new Error("S0 staged payload bytes differ from exact input bytes");
  }

  const summary = {
    status: result.status,
    transitionCommitment: result.transitionCommitment,
    warrantIssuerKeyId: result.warrantIssuerKeyId,
    warrantBodySha256: result.warrantBodySha256,
    warrantTrustStoreSha256: trusted.trustStoreSha256,
    nonce: result.nonce,
    payloadSha256: result.payloadSha256,
    payloadByteLength: result.payloadByteLength,
    payloadChannel: result.payloadChannel,
    payloadRecipient: result.payloadRecipient,
    payloadContentType: result.payloadContentType,
    s0State: result.s0State,
    exactPayloadBytesPersisted: true,
    providerDelivered: false,
    e1Executed: false,
    evmTransactionSubmitted: false,
  };

  await Promise.all([
    fs.writeFile(
      path.join(outputDir, "e2-stage.json"),
      JSON.stringify(summary, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "staged-payload.bin"),
      stage.payloadBytes
    ),
  ]);

  console.log(JSON.stringify(summary, null, 2));
} finally {
  store.close();
}

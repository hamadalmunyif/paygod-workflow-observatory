#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { releaseStagedPayloadThroughE2V0 } from "../src/e2-provider-release-v0.mjs";
import { trustedWarrantIssuersFromExternalTrustV0 } from "../src/warrant-issuer-trust-v0.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error("Missing required argument: " + name);
  return value;
}

const warrantBodyPath = requiredArg("--warrant-body");
const warrantSignaturePath = requiredArg("--warrant-signature");
const warrantTrustPath = requiredArg("--warrant-trust-store");
const transitionPath = requiredArg("--transition-envelope");
const txEvidencePath = requiredArg("--tx-evidence");
const stateDbPath = requiredArg("--state-db");
const rpcUrl = requiredArg("--rpc-url");
const providerUrl = requiredArg("--provider-url");
const outputDir = requiredArg("--output-dir");
const castBin = argValue("--cast-bin") ?? "cast";

await fs.mkdir(outputDir, { recursive: true });

const [
  warrantBodyBytes,
  warrantSignatureBytes,
  warrantTrustBytes,
  transitionEnvelopeBytes,
  txEvidenceBytes,
] = await Promise.all([
  fs.readFile(warrantBodyPath),
  fs.readFile(warrantSignaturePath),
  fs.readFile(warrantTrustPath),
  fs.readFile(transitionPath),
  fs.readFile(txEvidencePath),
]);

const trust = trustedWarrantIssuersFromExternalTrustV0({
  trustStore: JSON.parse(warrantTrustBytes.toString("utf8")),
  trustStoreBytes: warrantTrustBytes,
});

const store = await openAuthorityStateStoreV0(stateDbPath);
try {
  const result = await releaseStagedPayloadThroughE2V0({
    warrantBodyBytes,
    warrantSignatureBytes,
    trustedWarrantIssuers: trust.trustedIssuers,
    transitionEnvelopeBytes,
    txEvidenceBytes,
    authorityStateStore: store,
    rpcUrl,
    providerUrl,
    castBin,
    expectedDomain: trust.enforcementDomain,
  });

  const { transactionReceipt, releasedPayloadBytes, ...summary } = result;

  await Promise.all([
    fs.writeFile(
      path.join(outputDir, "e2-release.json"),
      JSON.stringify(summary, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "instance-binding.json"),
      JSON.stringify(result.instanceBinding, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "transaction-receipt.json"),
      JSON.stringify(transactionReceipt, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "released-payload.bin"),
      releasedPayloadBytes
    ),
  ]);

  console.log(JSON.stringify(summary, null, 2));
} finally {
  store.close();
}

#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { generateIssuerKeyPairV0 } from "../src/warrant-v0.mjs";
import { buildWarrantIssuerTrustStoreV0 } from "../src/warrant-issuer-trust-v0.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

const privateKeyPath = requiredArg("--private-key-output");
const trustPath = requiredArg("--trust-output");

await fs.mkdir(path.dirname(privateKeyPath), { recursive: true });
await fs.mkdir(path.dirname(trustPath), { recursive: true });

const { publicKey, privateKey } = generateIssuerKeyPairV0();
const trust = buildWarrantIssuerTrustStoreV0({ publicKey });

const privatePem = privateKey.export({
  type: "pkcs8",
  format: "pem",
});

await fs.writeFile(privateKeyPath, privatePem, {
  encoding: "utf8",
  mode: 0o600,
});
await fs.chmod(privateKeyPath, 0o600);
await fs.writeFile(trustPath, trust.bytes);

console.log(JSON.stringify({
  status: "WARRANT_ISSUER_TRUST_ANCHOR_CREATED",
  issuerKeyId: trust.issuerKeyId,
  trustStoreSha256: trust.sha256,
  privateKeyExportedToConfiguredSecretPath: true,
  privateKeyIncludedInTrustStore: false,
}, null, 2));

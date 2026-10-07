#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

import { AuthorityError } from "../src/authority-error.mjs";
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
function mutatedEvidence(bytes, mutate) {
  const value = JSON.parse(bytes.toString("utf8"));
  mutate(value);
  return Buffer.from(JSON.stringify(value) + "\n", "utf8");
}
async function expectCode(fn, code) {
  try {
    await fn();
  } catch (err) {
    if (err instanceof AuthorityError && err.code === code) {
      return { classification: "REJECTED_AS_EXPECTED", observed_code: err.code };
    }
    throw err;
  }
  throw new Error("expected " + code + " but E2 release accepted the attack");
}

const warrantBodyPath = requiredArg("--warrant-body");
const warrantSignaturePath = requiredArg("--warrant-signature");
const warrantTrustPath = requiredArg("--warrant-trust-store");
const transitionPath = requiredArg("--transition-envelope");
const txEvidencePath = requiredArg("--tx-evidence");
const stateDbPath = requiredArg("--state-db");
const rpcUrl = requiredArg("--rpc-url");
const providerUrl = requiredArg("--provider-url");
const outputPath = requiredArg("--output");
const castBin = argValue("--cast-bin") ?? "cast";

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

const warrantBody = JSON.parse(warrantBodyBytes.toString("utf8"));
const key = {
  issuerKeyId: warrantBody.issuer_key_id,
  nonce: warrantBody.nonce,
};

const store = await openAuthorityStateStoreV0(stateDbPath);
try {
  const before = store.get(key);
  if (before?.state !== "TX_EXECUTED") {
    throw new Error("post-execution E2 attacks require TX_EXECUTED");
  }

  const call = (bytes) =>
    releaseStagedPayloadThroughE2V0({
      warrantBodyBytes,
      warrantSignatureBytes,
      trustedWarrantIssuers: trust.trustedIssuers,
      transitionEnvelopeBytes,
      txEvidenceBytes: bytes,
      authorityStateStore: store,
      rpcUrl,
      providerUrl,
      castBin,
      expectedDomain: trust.enforcementDomain,
    });

  const a19Bytes = mutatedEvidence(txEvidenceBytes, (value) => {
    value.attack_marker = "A19";
  });
  const A19 = await expectCode(
    () => call(a19Bytes),
    "E2_RELEASE_TX_EVIDENCE_DIGEST_MISMATCH"
  );

  const a27Bytes = mutatedEvidence(txEvidenceBytes, (value) => {
    const input = String(value.input ?? "");
    if (!/^0x[0-9a-fA-F]+$/.test(input) || input.length < 4) {
      throw new Error("runtime tx evidence input is not mutable hex");
    }
    const firstByte = Number.parseInt(input.slice(2, 4), 16) ^ 0x01;
    value.input = "0x" + firstByte.toString(16).padStart(2, "0") + input.slice(4);
  });
  const A27 = await expectCode(
    () => call(a27Bytes),
    "E2_RELEASE_TX_EVIDENCE_DIGEST_MISMATCH"
  );

  const after = store.get(key);
  if (after?.state !== "TX_EXECUTED") {
    throw new Error("negative E2 attacks changed S0 state");
  }

  const result = {
    schema: "workflow-observatory/e2-post-execution-attacks/v0",
    state_before: before.state,
    state_after: after.state,
    provider_delivery_attempted: false,
    attempts: {
      A19: {
        ...A19,
        mechanism: "exact S0 tx-evidence digest binding",
      },
      A27: {
        ...A27,
        mechanism: "changed transaction evidence rejected before release",
      },
    },
  };

  await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.close();
}

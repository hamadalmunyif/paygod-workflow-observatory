#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { AuthorityError } from "../src/authority-error.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { stagePayloadThroughE2V0 } from "../src/e2-payload-gate-v0.mjs";
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
const warrantTrustStorePath = requiredArg("--warrant-trust-store");
const transitionEnvelopePath = requiredArg("--transition-envelope");
const payloadPath = requiredArg("--payload");
const stateDbPath = requiredArg("--state-db");
const outputPath = requiredArg("--output");
const payloadChannel = requiredArg("--payload-channel");
const payloadRecipient = requiredArg("--payload-recipient");
const payloadContentType = requiredArg("--payload-content-type");

const [
  warrantBodyBytes,
  warrantSignatureBytes,
  warrantTrustStoreBytes,
  transitionEnvelopeBytes,
  originalPayloadBytes,
] = await Promise.all([
  fs.readFile(warrantBodyPath),
  fs.readFile(warrantSignaturePath),
  fs.readFile(warrantTrustStorePath),
  fs.readFile(transitionEnvelopePath),
  fs.readFile(payloadPath),
]);

let trustStore;
try {
  trustStore = JSON.parse(warrantTrustStoreBytes.toString("utf8"));
} catch {
  throw new Error("Warrant issuer trust store is not valid JSON");
}

const trusted = trustedWarrantIssuersFromExternalTrustV0({
  trustStore,
  trustStoreBytes: warrantTrustStoreBytes,
});

const warrantBody = JSON.parse(warrantBodyBytes.toString("utf8"));
const mutatedPayloadBytes = Buffer.concat([
  originalPayloadBytes,
  Buffer.from("\n", "utf8"),
]);

const store = await openAuthorityStateStoreV0(stateDbPath);
let observedCode = null;
try {
  try {
    stagePayloadThroughE2V0({
      warrantBodyBytes,
      warrantSignatureBytes,
      trustedWarrantIssuers: trusted.trustedIssuers,
      transitionEnvelopeBytes,
      payloadBytes: mutatedPayloadBytes,
      payloadChannel,
      payloadRecipient,
      payloadContentType,
      authorityStateStore: store,
      expectedDomain: trusted.enforcementDomain,
    });
    throw new Error("A9 failed: changed payload bytes were accepted");
  } catch (err) {
    if (err instanceof AuthorityError) {
      observedCode = err.code;
    } else {
      throw err;
    }
  }

  if (observedCode !== "E2_PAYLOAD_DIGEST_MISMATCH") {
    throw new Error(
      "A9 produced unexpected code: " + String(observedCode)
    );
  }

  const row = store.get({
    issuerKeyId: warrantBody.issuer_key_id,
    nonce: warrantBody.nonce,
  });
  if (row?.state !== "ISSUED") {
    throw new Error(
      "A9 changed S0 state; expected ISSUED, observed " + String(row?.state)
    );
  }

  if (
    store.getStagedPayload({
      issuerKeyId: warrantBody.issuer_key_id,
      nonce: warrantBody.nonce,
    }) !== null
  ) {
    throw new Error("A9 created staged payload state despite rejection");
  }

  const summary = {
    schema: "workflow-observatory/t0-a9-payload-substitution/v0",
    attack: "A9",
    result: "REJECTED_AS_EXPECTED",
    observed_code: observedCode,
    valid_warrant_used: true,
    transition_envelope_unchanged: true,
    payload_bytes_changed: true,
    s0_state_after: row.state,
    staged_payload_created: false,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(summary, null, 2));
} finally {
  store.close();
}

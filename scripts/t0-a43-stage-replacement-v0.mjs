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
  payloadBytes,
] = await Promise.all([
  fs.readFile(warrantBodyPath),
  fs.readFile(warrantSignaturePath),
  fs.readFile(warrantTrustStorePath),
  fs.readFile(transitionEnvelopePath),
  fs.readFile(payloadPath),
]);

const warrantBody = JSON.parse(warrantBodyBytes.toString("utf8"));
const trustStore = JSON.parse(warrantTrustStoreBytes.toString("utf8"));
const trusted = trustedWarrantIssuersFromExternalTrustV0({
  trustStore,
  trustStoreBytes: warrantTrustStoreBytes,
});

const store = await openAuthorityStateStoreV0(stateDbPath);
let observedCode = null;
try {
  const before = store.getStagedPayload({
    issuerKeyId: warrantBody.issuer_key_id,
    nonce: warrantBody.nonce,
  });
  if (!before || !before.payloadBytes.equals(payloadBytes)) {
    throw new Error("A43 precondition failed: exact staged payload is missing");
  }

  try {
    stagePayloadThroughE2V0({
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
    throw new Error("A43 failed: second staging attempt was accepted");
  } catch (err) {
    if (err instanceof AuthorityError) observedCode = err.code;
    else throw err;
  }

  if (observedCode !== "S0_STATE_INVALID") {
    throw new Error("A43 unexpected rejection code: " + String(observedCode));
  }

  const after = store.getStagedPayload({
    issuerKeyId: warrantBody.issuer_key_id,
    nonce: warrantBody.nonce,
  });
  const row = store.get({
    issuerKeyId: warrantBody.issuer_key_id,
    nonce: warrantBody.nonce,
  });

  if (!after || !after.payloadBytes.equals(payloadBytes)) {
    throw new Error("A43 changed the immutable staged payload bytes");
  }
  if (row?.state !== "PAYLOAD_STAGED") {
    throw new Error("A43 changed S0 state unexpectedly: " + String(row?.state));
  }

  const summary = {
    schema: "workflow-observatory/t0-a43-stage-replacement/v0",
    attack: "A43",
    result: "REJECTED_AS_EXPECTED",
    observed_code: observedCode,
    s0_state_after: row.state,
    original_payload_preserved: true,
    second_stage_accepted: false,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(summary, null, 2));
} finally {
  store.close();
}

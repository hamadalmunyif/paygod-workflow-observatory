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

const [
  warrantBodyBytes,
  warrantSignatureBytes,
  trustBytes,
  transitionEnvelopeBytes,
] = await Promise.all([
  fs.readFile(requiredArg("--warrant-body")),
  fs.readFile(requiredArg("--warrant-signature")),
  fs.readFile(requiredArg("--warrant-trust-store")),
  fs.readFile(requiredArg("--transition-envelope")),
]);

const trust = trustedWarrantIssuersFromExternalTrustV0({
  trustStore: JSON.parse(trustBytes.toString("utf8")),
  trustStoreBytes: trustBytes,
});

const stateDbPath = requiredArg("--state-db");
const store = await openAuthorityStateStoreV0(stateDbPath);
try {
  let rejected = null;
  try {
    await releaseStagedPayloadThroughE2V0({
      warrantBodyBytes,
      warrantSignatureBytes,
      trustedWarrantIssuers: trust.trustedIssuers,
      transitionEnvelopeBytes,
      txEvidenceBytes: Buffer.from(
        JSON.stringify({
          schema: "workflow-observatory/local-e1-tx-evidence/v0",
        }),
        "utf8"
      ),
      authorityStateStore: store,
      rpcUrl: requiredArg("--rpc-url"),
      providerUrl: requiredArg("--provider-url"),
      expectedDomain: trust.enforcementDomain,
    });
  } catch (err) {
    if (err instanceof AuthorityError && err.code === "E2_RELEASE_STATE_INVALID") {
      rejected = { code: err.code, message: err.message };
    } else {
      throw err;
    }
  }

  if (!rejected) {
    throw new Error("A20/A41 failed: E2 release before TX_EXECUTED was accepted");
  }

  const warrant = JSON.parse(warrantBodyBytes.toString("utf8"));
  const row = store.get({
    issuerKeyId: warrant.issuer_key_id,
    nonce: warrant.nonce,
  });
  if (row?.state !== "PAYLOAD_STAGED") {
    throw new Error("A20/A41 rejection changed S0 state");
  }

  console.log(JSON.stringify({
    schema: "workflow-observatory/e2-pre-execution-release-attack/v0",
    attack: "A20/A41",
    status: "REJECTED_AS_EXPECTED",
    observed_code: rejected.code,
    s0_state_after: row.state,
    provider_delivery_attempted: false,
  }, null, 2));
} finally {
  store.close();
}

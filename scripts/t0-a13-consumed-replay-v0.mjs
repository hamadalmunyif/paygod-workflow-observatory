#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { AuthorityError } from "../src/authority-error.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { reserveTransactionThroughE1V0 } from "../src/e1-transaction-gate-v0.mjs";
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
function calldataBytesFromHex(value) {
  if (typeof value !== "string" || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error("proposal calldata_hex must be lowercase 0x-prefixed whole bytes");
  }
  return Buffer.from(value.slice(2), "hex");
}

const warrantBodyPath = requiredArg("--warrant-body");
const warrantSignaturePath = requiredArg("--warrant-signature");
const warrantTrustStorePath = requiredArg("--warrant-trust-store");
const transitionEnvelopePath = requiredArg("--transition-envelope");
const proposalPath = requiredArg("--transaction-proposal");
const stateDbPath = requiredArg("--state-db");
const outputPath = requiredArg("--output");

const [
  warrantBodyBytes,
  warrantSignatureBytes,
  warrantTrustStoreBytes,
  transitionEnvelopeBytes,
  proposal,
] = await Promise.all([
  fs.readFile(warrantBodyPath),
  fs.readFile(warrantSignaturePath),
  fs.readFile(warrantTrustStorePath),
  fs.readFile(transitionEnvelopePath),
  fs.readFile(proposalPath, "utf8").then(JSON.parse),
]);

const warrantBody = JSON.parse(warrantBodyBytes.toString("utf8"));
const trustStore = JSON.parse(warrantTrustStoreBytes.toString("utf8"));
const trusted = trustedWarrantIssuersFromExternalTrustV0({
  trustStore,
  trustStoreBytes: warrantTrustStoreBytes,
});
const calldataBytes = calldataBytesFromHex(proposal.calldata_hex);

const store = await openAuthorityStateStoreV0(stateDbPath);
let observedCode = null;
try {
  const before = store.get({
    issuerKeyId: warrantBody.issuer_key_id,
    nonce: warrantBody.nonce,
  });
  if (before?.state !== "TX_EXECUTED") {
    throw new Error(
      "A13 precondition failed: expected TX_EXECUTED, observed " +
        String(before?.state)
    );
  }

  try {
    reserveTransactionThroughE1V0({
      warrantBodyBytes,
      warrantSignatureBytes,
      trustedWarrantIssuers: trusted.trustedIssuers,
      transitionEnvelopeBytes,
      transaction: {
        system: proposal.system,
        chainId: proposal.chain_id,
        executionAccount: proposal.execution_account,
        target: proposal.target,
        calldataBytes,
        nativeValue: proposal.native_value,
      },
      authorityStateStore: store,
      expectedDomain: trusted.enforcementDomain,
    });
    throw new Error("A13 failed: consumed Warrant was reserved again");
  } catch (err) {
    if (err instanceof AuthorityError) observedCode = err.code;
    else throw err;
  }

  if (observedCode !== "S0_STATE_INVALID") {
    throw new Error("A13 unexpected rejection code: " + String(observedCode));
  }

  const after = store.get({
    issuerKeyId: warrantBody.issuer_key_id,
    nonce: warrantBody.nonce,
  });
  if (after?.state !== "TX_EXECUTED") {
    throw new Error("A13 replay changed S0 state");
  }

  const summary = {
    schema: "workflow-observatory/t0-a13-consumed-replay/v0",
    attack: "A13",
    result: "REJECTED_AS_EXPECTED",
    observed_code: observedCode,
    state_before: before.state,
    state_after: after.state,
    consumed_at_preserved: after.consumedAt !== null,
    second_reservation_accepted: false,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(summary, null, 2));
} finally {
  store.close();
}

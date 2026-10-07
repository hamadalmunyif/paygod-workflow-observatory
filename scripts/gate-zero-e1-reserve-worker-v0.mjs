#!/usr/bin/env node
import fs from "node:fs/promises";
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
  const v = argValue(name);
  if (!v) throw new Error("Missing required argument: " + name);
  return v;
}
async function waitForBarrier(path) {
  for (let i = 0; i < 500; i++) {
    try {
      await fs.access(path);
      return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("barrier was not released");
}
function calldataBytes(hex) {
  if (typeof hex !== "string" || !/^0x(?:[0-9a-f]{2})+$/.test(hex)) {
    throw new Error("transaction proposal calldata_hex invalid");
  }
  return Buffer.from(hex.slice(2), "hex");
}

const warrantBodyPath = requiredArg("--warrant-body");
const warrantSignaturePath = requiredArg("--warrant-signature");
const trustPath = requiredArg("--warrant-trust-store");
const envelopePath = requiredArg("--transition-envelope");
const proposalPath = requiredArg("--transaction-proposal");
const stateDbPath = requiredArg("--state-db");
const barrierPath = argValue("--barrier");
const workerId = argValue("--worker-id") ?? "worker";

if (barrierPath) await waitForBarrier(barrierPath);

const [body, sig, trustBytes, envelope, proposal] = await Promise.all([
  fs.readFile(warrantBodyPath),
  fs.readFile(warrantSignaturePath),
  fs.readFile(trustPath),
  fs.readFile(envelopePath),
  fs.readFile(proposalPath, "utf8").then(JSON.parse),
]);
const trust = trustedWarrantIssuersFromExternalTrustV0({
  trustStore: JSON.parse(trustBytes.toString("utf8")),
  trustStoreBytes: trustBytes,
});

const store = await openAuthorityStateStoreV0(stateDbPath);
try {
  try {
    const result = reserveTransactionThroughE1V0({
      warrantBodyBytes: body,
      warrantSignatureBytes: sig,
      trustedWarrantIssuers: trust.trustedIssuers,
      transitionEnvelopeBytes: envelope,
      transaction: {
        system: proposal.system,
        chainId: proposal.chain_id,
        executionAccount: proposal.execution_account,
        target: proposal.target,
        calldataBytes: calldataBytes(proposal.calldata_hex),
        nativeValue: proposal.native_value,
      },
      authorityStateStore: store,
      expectedDomain: trust.enforcementDomain,
    });
    process.stdout.write(JSON.stringify({
      worker: workerId,
      outcome: "RESERVED",
      state: result.s0State,
      nonce: result.nonce,
    }) + "\n");
  } catch (err) {
    if (!(err instanceof AuthorityError)) throw err;
    process.stdout.write(JSON.stringify({
      worker: workerId,
      outcome: "REJECTED",
      code: err.code,
      message: err.message,
    }) + "\n");
  }
} finally {
  store.close();
}

#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { AuthorityError } from "../src/authority-error.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { parseExactTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";
import { parseExactWarrantBodyV0 } from "../src/warrant-v0.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error("Missing required argument: " + name);
  return value;
}
function expectCode(fn, code) {
  try {
    fn();
  } catch (err) {
    if (err instanceof AuthorityError && err.code === code) {
      return { code: err.code, message: err.message };
    }
    throw err;
  }
  throw new Error("expected " + code + " but release unexpectedly succeeded");
}

const phase = requiredArg("--phase");
const warrantBodyPath = requiredArg("--warrant-body");
const envelopePath = requiredArg("--transition-envelope");
const stateDbPath = requiredArg("--state-db");
const outputPath = requiredArg("--output");

const [warrantBytes, envelopeBytes] = await Promise.all([
  fs.readFile(warrantBodyPath),
  fs.readFile(envelopePath),
]);
const warrant = parseExactWarrantBodyV0(warrantBytes);
const transition = parseExactTransitionEnvelopeV0(envelopeBytes);

const key = {
  issuerKeyId: warrant.body.issuer_key_id,
  nonce: warrant.body.nonce,
};

const store = await openAuthorityStateStoreV0(stateDbPath);
try {
  const staged = store.getStagedPayload(key);
  if (!staged) throw new Error("staged payload required for release attack");

  let result;
  if (phase === "pre-e1") {
    const before = store.get(key);
    if (before?.state !== "PAYLOAD_STAGED") {
      throw new Error("pre-e1 attack requires PAYLOAD_STAGED");
    }
    const rejected = expectCode(
      () =>
        store.releasePayload({
          ...key,
          transitionCommitment: transition.transitionCommitment,
          enforcementDomain: warrant.body.enforcement_domain,
          payloadSha256: staged.payloadSha256,
          requestedBy: "ATTACK_A20_A41",
        }),
      "S0_STATE_INVALID"
    );
    const after = store.get(key);
    if (after?.state !== "PAYLOAD_STAGED") {
      throw new Error("pre-e1 release attempt changed authority state");
    }
    result = {
      schema: "workflow-observatory/e2-release-attack/v0",
      phase,
      attacks: ["A20", "A41"],
      classification: "REJECTED_AS_EXPECTED",
      observed_code: rejected.code,
      state_before: before.state,
      state_after: after.state,
      provider_delivery_attempted: false,
    };
  } else if (phase === "post-e1") {
    const before = store.get(key);
    if (before?.state !== "TX_EXECUTED") {
      throw new Error("post-e1 invalid-E2 attack requires TX_EXECUTED");
    }
    const wrongDigest =
      staged.payloadSha256 === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64);
    const rejected = expectCode(
      () =>
        store.releasePayload({
          ...key,
          transitionCommitment: transition.transitionCommitment,
          enforcementDomain: warrant.body.enforcement_domain,
          payloadSha256: wrongDigest,
          requestedBy: "ATTACK_A19",
        }),
      "S0_STAGED_PAYLOAD_MISMATCH"
    );
    const after = store.get(key);
    if (after?.state !== "TX_EXECUTED") {
      throw new Error("invalid E2 release attempt changed authority state");
    }
    result = {
      schema: "workflow-observatory/e2-release-attack/v0",
      phase,
      attacks: ["A19"],
      classification: "REJECTED_AS_EXPECTED",
      observed_code: rejected.code,
      state_before: before.state,
      state_after: after.state,
      wrong_payload_digest: wrongDigest,
      provider_delivery_attempted: false,
    };
  } else {
    throw new Error("Unsupported --phase: " + phase);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.close();
}

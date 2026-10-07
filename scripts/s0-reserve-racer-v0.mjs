#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing environment variable: " + name);
  return value;
}

const dbPath = required("S0_DB_PATH");
const issuerKeyId = required("S0_ISSUER_KEY_ID");
const nonce = required("S0_NONCE");
const transitionCommitment = required("S0_TRANSITION_COMMITMENT");
const enforcementDomain = required("S0_ENFORCEMENT_DOMAIN");
const warrantBodySha256 = required("S0_WARRANT_BODY_SHA256");
const readyPath = required("S0_RACE_READY_PATH");
const startPath = required("S0_RACE_START_PATH");
const outputPath = required("S0_RACE_OUTPUT_PATH");
const nowMs = Number(required("S0_NOW_MS"));

const store = await openAuthorityStateStoreV0(dbPath, { now: () => nowMs });
fs.writeFileSync(readyPath, "ready\n", "utf8");

while (!fs.existsSync(startPath)) {
  await new Promise((resolve) => setTimeout(resolve, 2));
}

let result;
try {
  const reserved = store.reserveTransaction({
    issuerKeyId,
    nonce,
    transitionCommitment,
    enforcementDomain,
    warrantBodySha256,
  });
  result = {
    status: "RESERVED",
    state: reserved.state,
    consumedAt: reserved.consumedAt,
  };
} catch (err) {
  result = {
    status: "REJECTED",
    code: err?.code ?? null,
    name: err?.name ?? "Error",
    message: String(err?.message ?? err),
  };
} finally {
  store.close();
}

fs.writeFileSync(outputPath, JSON.stringify(result) + "\n", "utf8");

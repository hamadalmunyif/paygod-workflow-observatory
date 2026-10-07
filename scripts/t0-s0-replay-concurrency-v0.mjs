#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { AuthorityError } from "../src/authority-error.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";

const SELF = fileURLToPath(import.meta.url);
const DOMAIN = "controlled-harness/t0-v0";
const ISSUER = "ed25519-spki-sha256:" + "11".repeat(32);
const NONCE = "22".repeat(32);
const TRANSITION = "33".repeat(32);
const WARRANT_BODY = "44".repeat(32);
const PAYLOAD = Buffer.from('{"company":"Example"}', "utf8");
const NOW = 1_800_000_000_000;

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function sleepMs(ms) {
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.wait(view, 0, 0, ms);
}

async function workerMode() {
  const dbPath = argValue("--db");
  if (!dbPath) throw new Error("worker missing --db");

  let store;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      store = await openAuthorityStateStoreV0(dbPath, { now: () => NOW });
      break;
    } catch (err) {
      if (/locked|busy/i.test(String(err?.message ?? err))) {
        sleepMs(10);
        continue;
      }
      throw err;
    }
  }
  if (!store) throw new Error("worker could not open S0 after retries");

  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const row = store.reserveTransaction({
          issuerKeyId: ISSUER,
          nonce: NONCE,
          transitionCommitment: TRANSITION,
          enforcementDomain: DOMAIN,
          warrantBodySha256: WARRANT_BODY,
        });
        process.stdout.write(
          JSON.stringify({
            result: "TX_RESERVED",
            state: row.state,
            consumedAt: row.consumedAt,
          }) + "\n"
        );
        return;
      } catch (err) {
        if (
          err instanceof AuthorityError &&
          err.code === "S0_STATE_INVALID"
        ) {
          process.stdout.write(
            JSON.stringify({
              result: "REJECTED_AS_EXPECTED",
              code: err.code,
            }) + "\n"
          );
          return;
        }
        if (/locked|busy/i.test(String(err?.message ?? err))) {
          sleepMs(10);
          continue;
        }
        throw err;
      }
    }
    throw new Error("worker exhausted reservation retries");
  } finally {
    store.close();
  }
}

function runWorker(dbPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [SELF, "--worker", "--db", dbPath],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            "reservation worker failed (" + code + "): " + stderr.trim()
          )
        );
        return;
      }
      const lines = stdout.trim().split("\n").filter(Boolean);
      if (lines.length !== 1) {
        reject(new Error("worker emitted unexpected stdout: " + stdout));
        return;
      }
      try {
        resolve(JSON.parse(lines[0]));
      } catch {
        reject(new Error("worker emitted invalid JSON: " + stdout));
      }
    });
  });
}

if (process.argv.includes("--worker")) {
  await workerMode();
  process.exit(0);
}

const outputPath = argValue("--output");
if (!outputPath) throw new Error("Missing required argument: --output");

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paygod-t0-s0-"));
const dbPath = path.join(dir, "authority-state.db");

let store = await openAuthorityStateStoreV0(dbPath, { now: () => NOW });
try {
  store.registerIssued({
    issuerKeyId: ISSUER,
    nonce: NONCE,
    transitionCommitment: TRANSITION,
    enforcementDomain: DOMAIN,
    notBefore: NOW,
    expiresAt: NOW + 60_000,
    warrantBodySha256: WARRANT_BODY,
  });

  store.stagePayloadExact({
    issuerKeyId: ISSUER,
    nonce: NONCE,
    transitionCommitment: TRANSITION,
    enforcementDomain: DOMAIN,
    warrantBodySha256: WARRANT_BODY,
    payloadBytes: PAYLOAD,
    payloadChannel: "controlled-requirement-message/v0",
    payloadRecipient: "0x" + "55".repeat(20),
    payloadContentType: "requirement",
  });
} finally {
  store.close();
}

const concurrent = await Promise.all([
  runWorker(dbPath),
  runWorker(dbPath),
]);

const successCount = concurrent.filter(
  (item) => item.result === "TX_RESERVED"
).length;
const rejectionCount = concurrent.filter(
  (item) =>
    item.result === "REJECTED_AS_EXPECTED" &&
    item.code === "S0_STATE_INVALID"
).length;

if (successCount !== 1 || rejectionCount !== 1) {
  throw new Error(
    "A14 failed: expected exactly one reservation and one state rejection: " +
      JSON.stringify(concurrent)
  );
}

store = await openAuthorityStateStoreV0(dbPath, { now: () => NOW });
let replayCode = null;
let finalRow;
try {
  finalRow = store.get({ issuerKeyId: ISSUER, nonce: NONCE });
  if (finalRow?.state !== "TX_RESERVED" || finalRow.consumedAt === null) {
    throw new Error(
      "A14 final S0 state is not one consumed TX_RESERVED record"
    );
  }

  try {
    store.reserveTransaction({
      issuerKeyId: ISSUER,
      nonce: NONCE,
      transitionCommitment: TRANSITION,
      enforcementDomain: DOMAIN,
      warrantBodySha256: WARRANT_BODY,
    });
    throw new Error("A15 failed: replay after S0 restart was accepted");
  } catch (err) {
    if (
      err instanceof AuthorityError &&
      err.code === "S0_STATE_INVALID"
    ) {
      replayCode = err.code;
    } else {
      throw err;
    }
  }
} finally {
  store.close();
}

const summary = {
  schema: "workflow-observatory/t0-s0-replay-concurrency/v0",
  a14_concurrent_double_use: {
    result: "REJECTED_AS_EXPECTED",
    attempts: concurrent,
    successful_reservations: successCount,
    rejected_reservations: rejectionCount,
    final_state: finalRow.state,
  },
  a15_restart_replay: {
    result: "REJECTED_AS_EXPECTED",
    observed_code: replayCode,
    final_state: finalRow.state,
    consumed_at_present: finalRow.consumedAt !== null,
  },
  host_rollback_tested: false,
  host_rollback_boundary: "DEFERRED_TO_T1",
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
await fs.rm(dir, { recursive: true, force: true });

console.log(JSON.stringify(summary, null, 2));

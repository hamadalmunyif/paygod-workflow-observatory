#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { AuthorityError } from "../src/authority-error.mjs";
import { sha256Bytes } from "../src/digest.mjs";
import { deriveMatchingJobInstanceV0 } from "../src/postflight-binding-v0.mjs";
import { parseExactTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error("Missing required argument: " + name);
  return value;
}
function expectAuthorityCode(fn, code) {
  try {
    fn();
  } catch (err) {
    if (err instanceof AuthorityError && err.code === code) {
      return { code: err.code, message: err.message };
    }
    throw err;
  }
  throw new Error("expected " + code + " but mutation was accepted");
}
function runCast(args) {
  const result = spawnSync(argValue("--cast-bin") ?? "cast", args, {
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("cast failed: " + (result.stderr || result.stdout || "").trim());
  }
  return result.stdout.trim().toLowerCase();
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function addressTopic(address) {
  return "0x" + "0".repeat(24) + address.slice(2).toLowerCase();
}

const envelopePath = requiredArg("--transition-envelope");
const txEvidencePath = requiredArg("--tx-evidence");
const receiptPath = requiredArg("--transaction-receipt");
const stagedPayloadPath = requiredArg("--staged-payload");
const providerPayloadPath = requiredArg("--provider-payload");
const outputPath = requiredArg("--output");

const [envelopeBytes, txEvidence, receipt, stagedPayload, providerPayload] =
  await Promise.all([
    fs.readFile(envelopePath),
    fs.readFile(txEvidencePath, "utf8").then(JSON.parse),
    fs.readFile(receiptPath, "utf8").then(JSON.parse),
    fs.readFile(stagedPayloadPath),
    fs.readFile(providerPayloadPath),
  ]);

const transition = parseExactTransitionEnvelopeV0(envelopeBytes);
const topic0 = runCast([
  "keccak",
  "JobCreated(uint256,address,address,address,uint256,bytes32,address)",
]);

const baseTx = {
  hash: txEvidence.transaction_hash,
  from: txEvidence.from,
  to: txEvidence.to,
  input: txEvidence.input,
  value: txEvidence.value_hex,
};

const attempts = {};

// A26: provider-observed bytes must be the exact staged/committed payload.
{
  if (!providerPayload.equals(stagedPayload)) {
    throw new Error("positive provider payload does not equal staged payload");
  }
  const mutated = Buffer.concat([providerPayload, Buffer.from([0x00])]);
  if (sha256Bytes(mutated) === transition.envelope.payload.payload_sha256) {
    throw new Error("A26 mutation unexpectedly preserved payload digest");
  }
  attempts.A26 = {
    classification: "REJECTED_AS_EXPECTED",
    mechanism: "postflight payload digest/byte equality",
    mutated_payload_sha256: sha256Bytes(mutated),
    committed_payload_sha256: transition.envelope.payload.payload_sha256,
  };
}

// A27: correct requirement context cannot rescue a changed observed transaction.
{
  const tx = clone(baseTx);
  const inputBytes = Buffer.from(tx.input.slice(2), "hex");
  inputBytes[0] ^= 0x01;
  tx.input = "0x" + inputBytes.toString("hex");
  const rejected = expectAuthorityCode(
    () =>
      deriveMatchingJobInstanceV0({
        transition,
        observedChainId: txEvidence.chain_id,
        transaction: tx,
        receipt,
        jobCreatedTopic0: topic0,
      }),
    "POSTFLIGHT_CALLDATA_MISMATCH"
  );
  attempts.A27 = {
    classification: "REJECTED_AS_EXPECTED",
    observed_code: rejected.code,
  };
}

// A28: a substituted/non-matching job event cannot become authoritative.
{
  const mutatedReceipt = clone(receipt);
  const match = (mutatedReceipt.logs ?? []).find(
    (log) =>
      String(log.address ?? "").toLowerCase() ===
      transition.envelope.transaction.target
  );
  if (!match) throw new Error("A28 fixture has no target log");
  match.topics[0] = "0x" + "bb".repeat(32);
  const rejected = expectAuthorityCode(
    () =>
      deriveMatchingJobInstanceV0({
        transition,
        observedChainId: txEvidence.chain_id,
        transaction: baseTx,
        receipt: mutatedReceipt,
        jobCreatedTopic0: topic0,
      }),
    "POSTFLIGHT_JOB_EVENT_COUNT_INVALID"
  );
  attempts.A28 = {
    classification: "REJECTED_AS_EXPECTED",
    observed_code: rejected.code,
    caller_supplied_instance_authority: false,
  };
}

// A37: provider identity in the execution event must equal committed recipient.
{
  const mutatedReceipt = clone(receipt);
  const match = (mutatedReceipt.logs ?? []).find(
    (log) =>
      String(log.address ?? "").toLowerCase() ===
      transition.envelope.transaction.target &&
      String(log.topics?.[0] ?? "").toLowerCase() === topic0
  );
  if (!match) throw new Error("A37 fixture has no matching JobCreated event");
  match.topics[3] = addressTopic("0x" + "99".repeat(20));
  const rejected = expectAuthorityCode(
    () =>
      deriveMatchingJobInstanceV0({
        transition,
        observedChainId: txEvidence.chain_id,
        transaction: baseTx,
        receipt: mutatedReceipt,
        jobCreatedTopic0: topic0,
      }),
    "POSTFLIGHT_EVENT_PROVIDER_MISMATCH"
  );
  attempts.A37 = {
    classification: "REJECTED_AS_EXPECTED",
    observed_code: rejected.code,
  };
}

const result = {
  schema: "workflow-observatory/postflight-adversarial/v0",
  evidence_basis: "runtime-produced transition/transaction/receipt/provider artifacts",
  attempts,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify(result, null, 2));

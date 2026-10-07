#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { spawnSync } from "node:child_process";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing environment variable: " + name);
  return value;
}

const rClientUrl = required("R_CLIENT_URL");
const rAdminUrl = required("R_ADMIN_URL");
const target = required("TARGET").toLowerCase();
const protectedAccount = required("PROTECTED_EXECUTION_ACCOUNT").toLowerCase();
const calldataHex = required("CALLDATA_HEX").trim().toLowerCase();
const castBin = process.env.CAST_BIN ?? "/tools/cast";
const outputPath = process.env.GATE_ZERO_OUTPUT ?? "/work/gate-zero-e1-client.json";
const jobProvider = required("JOB_PROVIDER").toLowerCase();
const jobEvaluator = required("JOB_EVALUATOR").toLowerCase();
const jobExpiredAt = required("JOB_EXPIRED_AT");
const jobDescription = required("JOB_DESCRIPTION");
const jobHook = required("JOB_HOOK").toLowerCase();

// Anvil default account #0. Its secrecy is explicitly not a harness property.
const alternatePrivateKey =
  process.env.ALTERNATE_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

let rpcId = 1;
async function rpc(url, method, params = [], timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: rpcId++,
        method,
        params,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { malformed: true, raw: text.slice(0, 200) };
    }
    return { reachable: true, httpStatus: response.status, body };
  } catch (err) {
    return {
      reachable: false,
      errorName: err?.name ?? "Error",
      errorMessage: String(err?.message ?? err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function cast(args) {
  const result = spawnSync(castBin, args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error("cast failed to start: " + result.error.message);
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function requireProxyReject(result, method) {
  if (
    !result.reachable ||
    result.body?.error?.code !== -32099 ||
    result.body?.error?.message !== "PAYGOD_HARNESS_RPC_METHOD_REJECTED"
  ) {
    throw new Error(
      method + " was not deterministically rejected by R-client: " +
        JSON.stringify(result)
    );
  }
}

async function nextJobId() {
  const result = cast([
    "call",
    target,
    "nextJobId()(uint256)",
    "--rpc-url",
    rClientUrl,
  ]);
  if (result.status !== 0) {
    throw new Error("could not read nextJobId through R-client: " + result.stderr);
  }
  const match = result.stdout.match(/\d+/);
  if (!match) throw new Error("nextJobId output did not contain an integer");
  return Number(match[0]);
}

const forbiddenMethods = [
  ["anvil_setBalance", [protectedAccount, "0x1"]],
  ["eth_sendTransaction", [{ from: protectedAccount, to: target, data: calldataHex, value: "0x0" }]],
  ["eth_sign", [protectedAccount, "0x00"]],
  ["eth_signTransaction", [{ from: protectedAccount, to: target, data: calldataHex, value: "0x0" }]],
  ["personal_sign", ["0x00", protectedAccount]],
];

const forbiddenResults = [];
for (const [method, params] of forbiddenMethods) {
  const result = await rpc(rClientUrl, method, params);
  requireProxyReject(result, method);
  forbiddenResults.push({
    method,
    rejected: true,
    code: result.body.error.code,
  });
}

const adminProbe = await rpc(rAdminUrl, "eth_chainId", [], 1500);
if (adminProbe.reachable) {
  throw new Error(
    "A52 failed: adversarial C reached R-admin: " + JSON.stringify(adminProbe)
  );
}

const before = await nextJobId();

const makeTx = cast([
  "mktx",
  target,
  "createJob(address,address,uint256,string,address)",
  jobProvider,
  jobEvaluator,
  jobExpiredAt,
  jobDescription,
  jobHook,
  "--private-key",
  alternatePrivateKey,
  "--gas-limit",
  "500000",
  "--legacy",
  "--gas-price",
  "1gwei",
  "--rpc-url",
  rClientUrl,
  "--value",
  "0",
]);
if (makeTx.status !== 0) {
  throw new Error("alternate account could not build raw tx: " + makeTx.stderr);
}
const rawTx = makeTx.stdout.trim();
if (!/^0x[0-9a-fA-F]+$/.test(rawTx)) {
  throw new Error("cast mktx did not return a raw transaction");
}

const send = await rpc(rClientUrl, "eth_sendRawTransaction", [rawTx], 5000);
if (!send.reachable) {
  throw new Error("R-client raw transaction path was unreachable");
}

let alternateTxHash = null;
let alternateReceipt = null;
if (typeof send.body?.result === "string") {
  alternateTxHash = send.body.result.toLowerCase();
  for (let i = 0; i < 30; i++) {
    const receiptResult = await rpc(
      rClientUrl,
      "eth_getTransactionReceipt",
      [alternateTxHash],
      2000
    );
    if (receiptResult.body?.result) {
      alternateReceipt = receiptResult.body.result;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

if (!alternateReceipt) {
  throw new Error(
    "alternate raw transaction did not produce an observable receipt: " +
      JSON.stringify(send.body)
  );
}

if (
  alternateReceipt.status !== "0x0" &&
  alternateReceipt.status !== "0x00"
) {
  throw new Error(
    "A54 failed: alternate account transaction did not revert: " +
      JSON.stringify(alternateReceipt)
  );
}

const alternateTx = await rpc(
  rClientUrl,
  "eth_getTransactionByHash",
  [alternateTxHash],
  2000
);
if (!alternateTx.body?.result) {
  throw new Error("alternate transaction could not be read back");
}
if (String(alternateTx.body.result.input ?? "").toLowerCase() !== calldataHex) {
  throw new Error(
    "A54 harness defect: alternate raw tx input differs from frozen calldata"
  );
}
if (String(alternateTx.body.result.to ?? "").toLowerCase() !== target) {
  throw new Error(
    "A54 harness defect: alternate raw tx target differs from frozen target"
  );
}

const alternateSender = String(alternateTx.body.result.from ?? "").toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(alternateSender)) {
  throw new Error("A54 harness defect: alternate transaction sender is invalid");
}
if (alternateSender === protectedAccount) {
  throw new Error(
    "A54 failed: alternate signer unexpectedly produced the protected sender identity"
  );
}

const after = await nextJobId();
if (after !== before) {
  throw new Error(
    `A54 failed: alternate account changed nextJobId from ${before} to ${after}`
  );
}

const summary = {
  schema: "workflow-observatory/gate-zero-e1-client-preflight/v0",
  result: "NO_BYPASS_OBSERVED_IN_PREFLIGHT",
  claim_status: "PREFLIGHT_ONLY_T0_ATTACK_SET_NOT_COMPLETE",
  protected_execution_account: protectedAccount,
  target,
  a51_privileged_rpc_rejected: true,
  a52_r_admin_reachable: false,
  a53_node_managed_protected_signing_rejected: true,
  a54_alternate_account_tx_hash: alternateTxHash,
  a54_alternate_account_receipt_status: alternateReceipt.status,
  a54_alternate_sender: alternateSender,
  a54_protected_sender: protectedAccount,
  a54_alternate_sender_differs_from_protected: true,
  a54_exact_calldata_observed: true,
  a54_exact_target_observed: true,
  a54_protected_consequence_observed: false,
  next_job_id_before: before,
  next_job_id_after: after,
  raw_transaction_submission_available: true,
  forbidden_methods: forbiddenResults,
};

await fs.writeFile(outputPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log(JSON.stringify(summary, null, 2));

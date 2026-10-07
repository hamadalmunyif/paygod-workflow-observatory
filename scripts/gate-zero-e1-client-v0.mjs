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
const providerIngressUrl = required("PROVIDER_INGRESS_URL");

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

let providerIngressReachable = false;
let providerIngressResult = null;
{
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(providerIngressUrl, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-paygod-transition-commitment": "0".repeat(64),
        "x-paygod-instance-id": "1",
        "x-paygod-transaction-hash": "0x" + "0".repeat(64),
        "x-paygod-provider-recipient": jobProvider,
        "x-paygod-payload-sha256":
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      body: Buffer.alloc(0),
      signal: controller.signal,
    });
    providerIngressReachable = true;
    providerIngressResult = {
      httpStatus: response.status,
      body: (await response.text()).slice(0, 500),
    };
  } catch (err) {
    providerIngressResult = {
      reachable: false,
      errorName: err?.name ?? "Error",
      errorMessage: String(err?.message ?? err),
    };
  } finally {
    clearTimeout(timer);
  }
}
if (providerIngressReachable) {
  throw new Error(
    "A18 failed: adversarial C reached protected provider ingress: " +
      JSON.stringify(providerIngressResult)
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

const forbiddenSensitiveEnvNames = [
  "PROTECTED_EXECUTION_KEY_FILE",
  "WARRANT_ISSUER_PRIVATE_KEY",
  "DECISION_PRIVATE_KEY",
  "AUTHORITY_STATE_DB",
  "S0_DB",
  "S0_URL",
  "E1_URL",
  "E2_URL",
  "WARRANT_TRUST_STORE",
  "WARRANT_ISSUER_TRUST_STORE",
];
const exposedSensitiveEnv = forbiddenSensitiveEnvNames.filter(
  (name) => process.env[name] !== undefined
);
if (exposedSensitiveEnv.length !== 0) {
  throw new Error(
    "T0 key/S0/config boundary failed: sensitive environment exposed to C: " +
      exposedSensitiveEnv.join(",")
  );
}

const mountInfo = await fs.readFile("/proc/self/mountinfo", "utf8");
const relevantMountPoints = mountInfo
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => line.split(" ")[4])
  .filter((mountPoint) =>
    mountPoint === "/work" ||
    mountPoint.startsWith("/work/") ||
    mountPoint === "/tools" ||
    mountPoint.startsWith("/tools/")
  );

const forbiddenMountPattern =
  /(authority-state|warrant-issuer|private|runner\.temp|paygod-protected-execution-key)/i;
const sensitiveMounts = relevantMountPoints.filter((x) =>
  forbiddenMountPattern.test(x)
);
if (sensitiveMounts.length !== 0) {
  throw new Error(
    "T0 key/S0/config boundary failed: sensitive mount exposed to C: " +
      sensitiveMounts.join(",")
  );
}

const sensitivePaths = [
  "/work/authority-state.db",
  "/work/warrant-issuer-trust.json",
  "/work/paygod-protected-execution-key.txt",
  "/work/protected-execution-key.pem",
];
const accessibleSensitivePaths = [];
for (const candidate of sensitivePaths) {
  try {
    await fs.access(candidate);
    accessibleSensitivePaths.push(candidate);
  } catch {}
}
if (accessibleSensitivePaths.length !== 0) {
  throw new Error(
    "T0 key/S0/config boundary failed: sensitive file exposed to C: " +
      accessibleSensitivePaths.join(",")
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
  a18_provider_ingress_reachable: false,
  a18_provider_ingress_probe: providerIngressResult,
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
  t0_client_sensitive_env_absent: true,
  t0_client_sensitive_mount_absent: true,
  t0_client_sensitive_files_absent: true,
  t0_client_s0_control_interface_exposed: false,
  t0_client_enforcer_control_interface_exposed: false,
  t0_client_trust_control_interface_exposed: false,
  relevant_mount_points: relevantMountPoints,
  exposed_sensitive_env: exposedSensitiveEnv,
  accessible_sensitive_paths: accessibleSensitivePaths,
  forbidden_methods: forbiddenResults,
};

await fs.writeFile(outputPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log(JSON.stringify(summary, null, 2));

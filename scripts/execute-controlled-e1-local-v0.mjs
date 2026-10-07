#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { sha256Bytes } from "../src/digest.mjs";
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

function requireProposal(proposal) {
  if (
    proposal?.schema !==
    "workflow-observatory/local-evm-transaction-proposal/v0"
  ) {
    throw new Error("Unexpected local EVM transaction proposal schema");
  }
  return proposal;
}

function calldataBytesFromHex(value) {
  if (typeof value !== "string" || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error("proposal calldata_hex must be lowercase 0x-prefixed whole bytes");
  }
  return Buffer.from(value.slice(2), "hex");
}

function runCast(castBin, args, { allowFailure = false } = {}) {
  const result = spawnSync(castBin, args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error("cast could not be started: " + result.error.message);
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      "cast failed (" +
        result.status +
        "): " +
        (result.stderr || result.stdout || "").trim()
    );
  }
  return result;
}

async function rpcCall(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  if (!response.ok) {
    throw new Error("RPC HTTP failure for " + method + ": " + response.status);
  }
  const body = await response.json();
  if (body.error) {
    throw new Error(
      "RPC error for " + method + ": " + JSON.stringify(body.error)
    );
  }
  return body.result;
}

function lowerAddress(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(label + " is not an EVM address");
  }
  return value.toLowerCase();
}

function receiptSucceeded(status) {
  return status === "0x1" || status === "0x01" || status === 1 || status === "1";
}

const warrantBodyPath = requiredArg("--warrant-body");
const warrantSignaturePath = requiredArg("--warrant-signature");
const warrantTrustStorePath = requiredArg("--warrant-trust-store");
const transitionEnvelopePath = requiredArg("--transition-envelope");
const proposalPath = requiredArg("--transaction-proposal");
const stateDbPath = requiredArg("--state-db");
const privateKeyPath = requiredArg("--execution-private-key");
const rpcUrl = requiredArg("--rpc-url");
const outputDir = requiredArg("--output-dir");
const castBin = argValue("--cast-bin") ?? "cast";

await fs.mkdir(outputDir, { recursive: true });

const [
  warrantBodyBytes,
  warrantSignatureBytes,
  warrantTrustStoreBytes,
  transitionEnvelopeBytes,
  proposal,
  privateKey,
] = await Promise.all([
  fs.readFile(warrantBodyPath),
  fs.readFile(warrantSignaturePath),
  fs.readFile(warrantTrustStorePath),
  fs.readFile(transitionEnvelopePath),
  fs.readFile(proposalPath, "utf8").then(JSON.parse),
  fs.readFile(privateKeyPath, "utf8").then((x) => x.trim()),
]);

requireProposal(proposal);
const calldataBytes = calldataBytesFromHex(proposal.calldata_hex);

let warrantTrustStore;
try {
  warrantTrustStore = JSON.parse(warrantTrustStoreBytes.toString("utf8"));
} catch {
  throw new Error("Warrant issuer trust store is not valid JSON");
}

const trusted = trustedWarrantIssuersFromExternalTrustV0({
  trustStore: warrantTrustStore,
  trustStoreBytes: warrantTrustStoreBytes,
});

const addressResult = runCast(castBin, [
  "wallet",
  "address",
  "--private-key",
  privateKey,
]);
const derivedExecutionAccount = lowerAddress(
  addressResult.stdout.trim(),
  "derived execution account"
);
if (derivedExecutionAccount !== proposal.execution_account) {
  throw new Error(
    "protected execution private key does not match proposal execution account"
  );
}

const store = await openAuthorityStateStoreV0(stateDbPath);
try {
  const reserved = reserveTransactionThroughE1V0({
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

  const e1Verification = {
    schema: "workflow-observatory/e1-verification/v0",
    status: "TX_RESERVED",
    warrant_verification: "VALID",
    trusted_issuer: true,
    enforcement_domain: trusted.enforcementDomain,
    transition_commitment: reserved.transitionCommitment,
    chain_id: proposal.chain_id,
    execution_account: proposal.execution_account,
    target: proposal.target,
    calldata_sha256: proposal.calldata_sha256,
    native_value: proposal.native_value,
    s0_reservation: "TX_RESERVED",
    signature_returned_to_caller: false,
    operational_metadata_supplied_by_caller: false,
  };
  await fs.writeFile(
    path.join(outputDir, "e1-verification.json"),
    JSON.stringify(e1Verification, null, 2) + "\n",
    "utf8"
  );

  const send = runCast(castBin, [
    "send",
    proposal.target,
    "--data",
    proposal.calldata_hex,
    "--private-key",
    privateKey,
    "--rpc-url",
    rpcUrl,
    "--value",
    proposal.native_value,
    "--json",
  ]);

  let castReceipt;
  try {
    castReceipt = JSON.parse(send.stdout);
  } catch {
    throw new Error("cast send did not emit valid JSON receipt");
  }

  const txHash = castReceipt.transactionHash;
  if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error("cast send receipt did not contain transactionHash");
  }

  const [chainIdHex, tx, receipt] = await Promise.all([
    rpcCall(rpcUrl, "eth_chainId"),
    rpcCall(rpcUrl, "eth_getTransactionByHash", [txHash]),
    rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]),
  ]);

  if (!tx || !receipt) {
    throw new Error("transaction or receipt missing after local submission");
  }

  const observedChainId = Number.parseInt(chainIdHex, 16);
  if (observedChainId !== proposal.chain_id) {
    throw new Error("observed chain id differs from authorized proposal");
  }

  const observedFrom = lowerAddress(tx.from, "transaction from");
  const observedTo = lowerAddress(tx.to, "transaction to");
  if (observedFrom !== proposal.execution_account) {
    throw new Error("observed sender differs from protected execution account");
  }
  if (observedTo !== proposal.target) {
    throw new Error("observed target differs from authorized proposal");
  }

  const observedInput = String(tx.input ?? "").toLowerCase();
  if (observedInput !== proposal.calldata_hex) {
    throw new Error("observed calldata differs from authorized proposal");
  }

  if (BigInt(tx.value) !== BigInt(proposal.native_value)) {
    throw new Error("observed native value differs from authorized proposal");
  }

  if (!receiptSucceeded(receipt.status)) {
    throw new Error("local EVM transaction receipt status is not success");
  }

  const txEvidence = {
    schema: "workflow-observatory/local-e1-tx-evidence/v0",
    transition_commitment: reserved.transitionCommitment,
    transaction_hash: txHash.toLowerCase(),
    chain_id: observedChainId,
    from: observedFrom,
    to: observedTo,
    input: observedInput,
    value_hex: String(tx.value).toLowerCase(),
    receipt_status: receipt.status,
    block_hash: String(receipt.blockHash).toLowerCase(),
    block_number: String(receipt.blockNumber).toLowerCase(),
  };
  const txEvidenceBytes = Buffer.from(JSON.stringify(txEvidence), "utf8");
  const txEvidenceSha256 = sha256Bytes(txEvidenceBytes);

  const executed = store.markTxExecuted({
    issuerKeyId: reserved.warrantIssuerKeyId,
    nonce: reserved.nonce,
    transitionCommitment: reserved.transitionCommitment,
    enforcementDomain: trusted.enforcementDomain,
    txEvidenceSha256,
  });

  if (executed?.state !== "TX_EXECUTED") {
    throw new Error("S0 did not reach TX_EXECUTED");
  }

  const summary = {
    status: "TX_EXECUTED",
    transitionCommitment: reserved.transitionCommitment,
    warrantIssuerKeyId: reserved.warrantIssuerKeyId,
    warrantBodySha256: reserved.warrantBodySha256,
    nonce: reserved.nonce,
    protectedExecutionAccount: proposal.execution_account,
    target: proposal.target,
    calldataSha256: proposal.calldata_sha256,
    nativeValue: proposal.native_value,
    transactionHash: txHash.toLowerCase(),
    txEvidenceSha256,
    s0State: executed.state,
    signatureReturnedToCaller: false,
    operationalMetadataSuppliedByCaller: false,
    providerDelivered: false,
    payloadReleased: false,
    acpOrQuiverInteraction: false,
  };

  await Promise.all([
    fs.writeFile(
      path.join(outputDir, "tx-evidence.json"),
      txEvidenceBytes
    ),
    fs.writeFile(
      path.join(outputDir, "e1-execution.json"),
      JSON.stringify(summary, null, 2) + "\n",
      "utf8"
    ),
  ]);

  console.log(JSON.stringify(summary, null, 2));
} finally {
  store.close();
}

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AuthorityError } from "../src/authority-error.mjs";
import { sha256Bytes } from "../src/digest.mjs";
import { buildTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";
import {
  CONTROLLED_ENFORCEMENT_DOMAIN,
  buildWarrantBodyV0,
  exportIssuerPublicKeySpkiDer,
  generateIssuerKeyPairV0,
  issuerKeyIdFromPublicKey,
  signWarrantBodyV0,
} from "../src/warrant-v0.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { stagePayloadThroughE2V0 } from "../src/e2-payload-gate-v0.mjs";
import { reserveTransactionThroughE1V0 } from "../src/e1-transaction-gate-v0.mjs";

function expectCode(fn, code) {
  assert.throws(fn, (err) => err instanceof AuthorityError && err.code === code);
}

let sqliteAvailable = false;
try {
  await import("node:sqlite");
  sqliteAvailable = true;
} catch {}

const payloadBytes = Buffer.from('{"company":"Example"}', "utf8");
const calldataBytes = Buffer.from("controlled-harness:createJob:fixture-v0", "utf8");
const executionAccount = "0x" + "11".repeat(20);
const target = "0x" + "22".repeat(20);
const recipient = "0x" + "33".repeat(20);

async function fixture({ stage = true } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paygod-e1-"));
  const dbPath = path.join(dir, "authority.db");
  const now = 1_800_000_000_000;
  const store = await openAuthorityStateStoreV0(dbPath, { now: () => now });
  const tx = buildTransitionEnvelopeV0({
    requestIdentitySha256: "44".repeat(32),
    transaction: {
      system: "evm",
      chainId: 31337,
      executionAccount,
      target,
      calldataSha256: sha256Bytes(calldataBytes),
      nativeValue: "0",
    },
    payload: {
      channel: "controlled-requirement-message/v0",
      recipient,
      contentType: "requirement",
      payloadSha256: sha256Bytes(payloadBytes),
    },
  });
  const { publicKey, privateKey } = generateIssuerKeyPairV0();
  const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
  const body = buildWarrantBodyV0({
    transitionCommitment: tx.transitionCommitment,
    notBefore: now,
    expiresAt: now + 60_000,
    nonce: "77".repeat(32),
    issuerKeyId,
  });
  const signed = signWarrantBodyV0({ bodyBytes: body.bytes, privateKey, publicKey });
  const trusted = new Map([[issuerKeyId, exportIssuerPublicKeySpkiDer(publicKey)]]);
  store.registerIssued({
    issuerKeyId,
    nonce: body.body.nonce,
    transitionCommitment: tx.transitionCommitment,
    enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
    notBefore: body.body.not_before,
    expiresAt: body.body.expires_at,
    warrantBodySha256: body.bodySha256,
  });
  if (stage) {
    stagePayloadThroughE2V0({
      warrantBodyBytes: body.bytes,
      warrantSignatureBytes: signed.signatureBytes,
      trustedWarrantIssuers: trusted,
      transitionEnvelopeBytes: tx.bytes,
      payloadBytes,
      payloadChannel: "controlled-requirement-message/v0",
      payloadRecipient: recipient,
      payloadContentType: "requirement",
      authorityStateStore: store,
    });
  }
  return {
    dir, store, tx, body, signed, trusted, issuerKeyId,
    async close() {
      store.close();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

function args(x, transaction = {}) {
  return {
    warrantBodyBytes: x.body.bytes,
    warrantSignatureBytes: x.signed.signatureBytes,
    trustedWarrantIssuers: x.trusted,
    transitionEnvelopeBytes: x.tx.bytes,
    transaction: {
      system: "evm",
      chainId: 31337,
      executionAccount,
      target,
      calldataBytes,
      nativeValue: "0",
      ...transaction,
    },
    authorityStateStore: x.store,
  };
}

test("E1 reaches TX_RESERVED only for the exact staged transaction action", { skip: !sqliteAvailable }, async () => {
  const x = await fixture();
  try {
    const result = reserveTransactionThroughE1V0(args(x));
    assert.equal(result.status, "TX_RESERVED");
    assert.equal(result.signatureProduced, false);
    assert.equal(result.transactionSubmitted, false);
    assert.equal(x.store.get({ issuerKeyId: x.issuerKeyId, nonce: x.body.body.nonce }).state, "TX_RESERVED");
  } finally { await x.close(); }
});

test("A40 E1 before E2 staging is rejected", { skip: !sqliteAvailable }, async () => {
  const x = await fixture({ stage: false });
  try {
    expectCode(() => reserveTransactionThroughE1V0(args(x)), "S0_STATE_INVALID");
  } finally { await x.close(); }
});

test("transaction and execution-account substitution are rejected", { skip: !sqliteAvailable }, async () => {
  const a = await fixture();
  try {
    expectCode(
      () => reserveTransactionThroughE1V0(args(a, { calldataBytes: Buffer.from("different") })),
      "E1_CALLDATA_DIGEST_MISMATCH"
    );
  } finally { await a.close(); }

  const b = await fixture();
  try {
    expectCode(
      () => reserveTransactionThroughE1V0(args(b, { executionAccount: "0x" + "aa".repeat(20) })),
      "E1_EXECUTION_ACCOUNT_MISMATCH"
    );
  } finally { await b.close(); }
});

test("A55 caller operational metadata is rejected", { skip: !sqliteAvailable }, async () => {
  const x = await fixture();
  try {
    expectCode(
      () => reserveTransactionThroughE1V0(args(x, { nonce: 1 })),
      "E1_OPERATIONAL_METADATA_FORBIDDEN"
    );
  } finally { await x.close(); }
});

test("second reservation is rejected after TX_RESERVED consumption", { skip: !sqliteAvailable }, async () => {
  const x = await fixture();
  try {
    reserveTransactionThroughE1V0(args(x));
    expectCode(() => reserveTransactionThroughE1V0(args(x)), "S0_STATE_INVALID");
  } finally { await x.close(); }
});

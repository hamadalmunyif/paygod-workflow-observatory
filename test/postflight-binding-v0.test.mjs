import test from "node:test";
import assert from "node:assert/strict";

import { AuthorityError } from "../src/authority-error.mjs";
import { sha256Bytes } from "../src/digest.mjs";
import { deriveMatchingJobInstanceV0 } from "../src/postflight-binding-v0.mjs";
import { buildTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";

const executionAccount = "0x" + "11".repeat(20);
const target = "0x" + "22".repeat(20);
const provider = "0x" + "33".repeat(20);
const calldata = Buffer.from("01020304", "hex");
const topic0 = "0x" + "aa".repeat(32);

function addressTopic(address) {
  return "0x" + "0".repeat(24) + address.slice(2);
}
function uintTopic(value) {
  return "0x" + BigInt(value).toString(16).padStart(64, "0");
}
function fixture(overrides = {}) {
  const transition = buildTransitionEnvelopeV0({
    requestIdentitySha256: "44".repeat(32),
    transaction: {
      system: "evm",
      chainId: 31337,
      executionAccount,
      target,
      calldataSha256: sha256Bytes(calldata),
      nativeValue: "0",
    },
    payload: {
      channel: "controlled-requirement-message/v0",
      recipient: provider,
      contentType: "requirement",
      payloadSha256: "55".repeat(32),
    },
  });
  const txHash = "0x" + "66".repeat(32);
  const transaction = {
    hash: txHash,
    from: executionAccount,
    to: target,
    input: "0x" + calldata.toString("hex"),
    value: "0x0",
    ...(overrides.transaction ?? {}),
  };
  const receipt = {
    transactionHash: txHash,
    status: "0x1",
    blockHash: "0x" + "77".repeat(32),
    blockNumber: "0x1",
    logs: [
      {
        address: target,
        topics: [
          topic0,
          uintTopic(1),
          addressTopic(executionAccount),
          addressTopic(provider),
        ],
        data: "0x",
      },
    ],
    ...(overrides.receipt ?? {}),
  };
  return { transition, transaction, receipt };
}
function expectCode(fn, code) {
  assert.throws(
    fn,
    (err) => err instanceof AuthorityError && err.code === code
  );
}

test("post-flight binder derives job id from exact matching receipt event", () => {
  const x = fixture();
  const result = deriveMatchingJobInstanceV0({
    transition: x.transition,
    observedChainId: 31337,
    transaction: x.transaction,
    receipt: x.receipt,
    jobCreatedTopic0: topic0,
  });
  assert.equal(result.classification, "INSTANCE_DERIVED_FROM_MATCHING_EXECUTION");
  assert.equal(result.instance_id, "1");
  assert.equal(result.provider, provider);
  assert.equal(result.execution_account, executionAccount);
  assert.equal(result.calldata_sha256, sha256Bytes(calldata));
});

test("A37 provider substitution in JobCreated event is rejected", () => {
  const x = fixture();
  x.receipt.logs[0].topics[3] = addressTopic("0x" + "99".repeat(20));
  expectCode(
    () =>
      deriveMatchingJobInstanceV0({
        transition: x.transition,
        observedChainId: 31337,
        transaction: x.transaction,
        receipt: x.receipt,
        jobCreatedTopic0: topic0,
      }),
    "POSTFLIGHT_EVENT_PROVIDER_MISMATCH"
  );
});

test("A27 changed observed calldata is rejected post-flight", () => {
  const x = fixture({
    transaction: { input: "0x05060708" },
  });
  expectCode(
    () =>
      deriveMatchingJobInstanceV0({
        transition: x.transition,
        observedChainId: 31337,
        transaction: x.transaction,
        receipt: x.receipt,
        jobCreatedTopic0: topic0,
      }),
    "POSTFLIGHT_CALLDATA_MISMATCH"
  );
});

test("A28 non-matching job event cannot produce an instance binding", () => {
  const x = fixture();
  x.receipt.logs[0].topics[0] = "0x" + "bb".repeat(32);
  expectCode(
    () =>
      deriveMatchingJobInstanceV0({
        transition: x.transition,
        observedChainId: 31337,
        transaction: x.transaction,
        receipt: x.receipt,
        jobCreatedTopic0: topic0,
      }),
    "POSTFLIGHT_JOB_EVENT_COUNT_INVALID"
  );
});

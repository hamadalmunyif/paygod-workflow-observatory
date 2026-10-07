import { authorityFail } from "./authority-error.mjs";
import { sha256Bytes } from "./digest.mjs";

function requireHex(value, bytes, code, label) {
  const re = new RegExp("^0x[0-9a-fA-F]{" + bytes * 2 + "}$");
  if (typeof value !== "string" || !re.test(value)) {
    authorityFail(code, label + " has invalid hex profile");
  }
  return value.toLowerCase();
}

function requireAddress(value, code, label) {
  return requireHex(value, 20, code, label);
}

function topicAddress(topic, code, label) {
  const value = requireHex(topic, 32, code, label);
  if (!/^0x0{24}[0-9a-f]{40}$/.test(value)) {
    authorityFail(code, label + " is not a canonically padded address topic");
  }
  return "0x" + value.slice(-40);
}

function receiptSucceeded(status) {
  return status === "0x1" || status === "0x01" || status === 1 || status === "1";
}

function normalizeQuantity(value, code, label) {
  try {
    return BigInt(value);
  } catch {
    authorityFail(code, label + " is not an EVM quantity");
  }
}

export function deriveMatchingJobInstanceV0({
  transition,
  observedChainId,
  transaction,
  receipt,
  jobCreatedTopic0,
}) {
  if (!transition?.envelope?.transaction || !transition?.envelope?.payload) {
    authorityFail(
      "POSTFLIGHT_TRANSITION_REQUIRED",
      "parsed Transition Envelope v0 is required"
    );
  }

  const expectedTx = transition.envelope.transaction;
  const expectedPayload = transition.envelope.payload;
  const txFrom = requireAddress(
    transaction?.from,
    "POSTFLIGHT_FROM_INVALID",
    "transaction.from"
  );
  const txTo = requireAddress(
    transaction?.to,
    "POSTFLIGHT_TO_INVALID",
    "transaction.to"
  );
  const expectedFrom = requireAddress(
    expectedTx.execution_account,
    "POSTFLIGHT_EXPECTED_ACCOUNT_INVALID",
    "transition execution_account"
  );
  const expectedTo = requireAddress(
    expectedTx.target,
    "POSTFLIGHT_EXPECTED_TARGET_INVALID",
    "transition target"
  );

  if (observedChainId !== expectedTx.chain_id) {
    authorityFail(
      "POSTFLIGHT_CHAIN_MISMATCH",
      "observed chain id differs from authorized transition"
    );
  }
  if (txFrom !== expectedFrom) {
    authorityFail(
      "POSTFLIGHT_SENDER_MISMATCH",
      "observed transaction sender differs from authorized execution account"
    );
  }
  if (txTo !== expectedTo) {
    authorityFail(
      "POSTFLIGHT_TARGET_MISMATCH",
      "observed transaction target differs from authorized target"
    );
  }

  const input = String(transaction?.input ?? "").toLowerCase();
  if (!/^0x(?:[0-9a-f]{2})+$/.test(input)) {
    authorityFail(
      "POSTFLIGHT_CALLDATA_INVALID",
      "observed transaction calldata is invalid"
    );
  }

  const calldataBytes = Buffer.from(input.slice(2), "hex");
  const observedCalldataSha256 = sha256Bytes(calldataBytes);
  if (observedCalldataSha256 !== expectedTx.calldata_sha256) {
    authorityFail(
      "POSTFLIGHT_CALLDATA_MISMATCH",
      "observed transaction calldata differs from authorized transition"
    );
  }

  const expectedValue = normalizeQuantity(
    expectedTx.native_value,
    "POSTFLIGHT_EXPECTED_VALUE_INVALID",
    "authorized native value"
  );
  const observedValue = normalizeQuantity(
    transaction?.value,
    "POSTFLIGHT_VALUE_INVALID",
    "observed transaction value"
  );
  if (observedValue !== expectedValue) {
    authorityFail(
      "POSTFLIGHT_VALUE_MISMATCH",
      "observed native value differs from authorized transition"
    );
  }

  if (!receipt || !receiptSucceeded(receipt.status)) {
    authorityFail(
      "POSTFLIGHT_RECEIPT_NOT_SUCCESS",
      "matching successful transaction receipt is required"
    );
  }

  const expectedEventTopic0 = requireHex(
    jobCreatedTopic0,
    32,
    "POSTFLIGHT_EVENT_TOPIC_INVALID",
    "JobCreated topic0"
  );

  const matching = (Array.isArray(receipt.logs) ? receipt.logs : []).filter(
    (log) =>
      String(log?.address ?? "").toLowerCase() === expectedTo &&
      Array.isArray(log?.topics) &&
      log.topics.length === 4 &&
      String(log.topics[0]).toLowerCase() === expectedEventTopic0
  );

  if (matching.length !== 1) {
    authorityFail(
      "POSTFLIGHT_JOB_EVENT_COUNT_INVALID",
      "exactly one matching JobCreated event is required"
    );
  }

  const event = matching[0];
  const jobIdTopic = requireHex(
    event.topics[1],
    32,
    "POSTFLIGHT_JOB_ID_INVALID",
    "JobCreated jobId topic"
  );
  const jobId = BigInt(jobIdTopic);
  if (jobId <= 0n) {
    authorityFail(
      "POSTFLIGHT_JOB_ID_INVALID",
      "derived JobCreated job id must be positive"
    );
  }

  const eventClient = topicAddress(
    event.topics[2],
    "POSTFLIGHT_EVENT_CLIENT_INVALID",
    "JobCreated client"
  );
  const eventProvider = topicAddress(
    event.topics[3],
    "POSTFLIGHT_EVENT_PROVIDER_INVALID",
    "JobCreated provider"
  );
  const expectedProvider = requireAddress(
    expectedPayload.recipient,
    "POSTFLIGHT_EXPECTED_PROVIDER_INVALID",
    "transition payload recipient"
  );

  if (eventClient !== expectedFrom) {
    authorityFail(
      "POSTFLIGHT_EVENT_CLIENT_MISMATCH",
      "JobCreated client differs from authorized execution account"
    );
  }
  if (eventProvider !== expectedProvider) {
    authorityFail(
      "POSTFLIGHT_EVENT_PROVIDER_MISMATCH",
      "JobCreated provider differs from committed payload recipient"
    );
  }

  const txHash = requireHex(
    receipt.transactionHash ?? transaction.hash,
    32,
    "POSTFLIGHT_TX_HASH_INVALID",
    "transaction hash"
  );

  return {
    schema: "workflow-observatory/instance-binding/v0",
    classification: "INSTANCE_DERIVED_FROM_MATCHING_EXECUTION",
    transition_commitment: transition.transitionCommitment,
    transaction_hash: txHash,
    chain_id: observedChainId,
    execution_account: expectedFrom,
    target: expectedTo,
    calldata_sha256: observedCalldataSha256,
    native_value: expectedTx.native_value,
    provider: expectedProvider,
    instance_type: "ControlledJobRailV0.jobId",
    instance_id: jobId.toString(10),
    block_hash: String(receipt.blockHash ?? "").toLowerCase(),
    block_number: String(receipt.blockNumber ?? "").toLowerCase(),
  };
}

import { authorityFail } from "./authority-error.mjs";
import { sha256Bytes } from "./digest.mjs";
import { parseExactTransitionEnvelopeV0 } from "./transition-envelope-v0.mjs";
import {
  CONTROLLED_ENFORCEMENT_DOMAIN,
  verifyWarrantV0,
} from "./warrant-v0.mjs";

const FORBIDDEN_OPERATIONAL_FIELDS = new Set([
  "nonce",
  "gas",
  "gasLimit",
  "gas_limit",
  "gasPrice",
  "gas_price",
  "maxFeePerGas",
  "max_fee_per_gas",
  "maxPriorityFeePerGas",
  "max_priority_fee_per_gas",
  "transactionType",
  "transaction_type",
  "rawTransaction",
  "raw_transaction",
  "signature",
]);

const ALLOWED_FIELDS = new Set([
  "system",
  "chainId",
  "executionAccount",
  "target",
  "calldataBytes",
  "nativeValue",
]);

function requireString(value, code, label) {
  if (typeof value !== "string" || value.length === 0) {
    authorityFail(code, label + " must be a non-empty string");
  }
  return value;
}

function requirePositiveChainId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    authorityFail(
      "E1_CHAIN_ID_INVALID",
      "transaction.chainId must be a positive safe integer"
    );
  }
  return value;
}

function requireBytes(value, code, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  authorityFail(code, label + " must be explicit bytes or UTF-8 text");
}

function rejectCallerOperationalMetadata(transaction) {
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) {
    authorityFail(
      "E1_TRANSACTION_REQUIRED",
      "transaction proposal must be an object"
    );
  }

  for (const key of Object.keys(transaction)) {
    if (FORBIDDEN_OPERATIONAL_FIELDS.has(key)) {
      authorityFail(
        "E1_OPERATIONAL_METADATA_FORBIDDEN",
        "caller must not supply operational transaction field: " + key
      );
    }
    if (!ALLOWED_FIELDS.has(key)) {
      authorityFail(
        "E1_TRANSACTION_FIELD_UNSUPPORTED",
        "unsupported transaction proposal field: " + key
      );
    }
  }
}

export function reserveTransactionThroughE1V0({
  warrantBodyBytes,
  warrantSignatureBytes,
  trustedWarrantIssuers,
  transitionEnvelopeBytes,
  transaction,
  authorityStateStore,
  expectedDomain = CONTROLLED_ENFORCEMENT_DOMAIN,
}) {
  if (
    !authorityStateStore ||
    typeof authorityStateStore.currentTimeMs !== "function" ||
    typeof authorityStateStore.reserveTransaction !== "function"
  ) {
    authorityFail(
      "E1_S0_REQUIRED",
      "authorityStateStore with currentTimeMs/reserveTransaction is required"
    );
  }

  rejectCallerOperationalMetadata(transaction);

  const exactWarrantBodyBytes = requireBytes(
    warrantBodyBytes,
    "E1_WARRANT_BODY_REQUIRED",
    "warrantBodyBytes"
  );
  const exactWarrantSignatureBytes = requireBytes(
    warrantSignatureBytes,
    "E1_WARRANT_SIGNATURE_REQUIRED",
    "warrantSignatureBytes"
  );
  const exactEnvelopeBytes = requireBytes(
    transitionEnvelopeBytes,
    "E1_TRANSITION_ENVELOPE_REQUIRED",
    "transitionEnvelopeBytes"
  );
  const exactCalldataBytes = requireBytes(
    transaction.calldataBytes,
    "E1_CALLDATA_BYTES_REQUIRED",
    "transaction.calldataBytes"
  );

  const transition = parseExactTransitionEnvelopeV0(exactEnvelopeBytes);
  const nowMs = authorityStateStore.currentTimeMs();
  const warrant = verifyWarrantV0({
    bodyBytes: exactWarrantBodyBytes,
    signatureBytes: exactWarrantSignatureBytes,
    trustedIssuers: trustedWarrantIssuers,
    expectedDomain,
    expectedTransitionCommitment: transition.transitionCommitment,
    nowMs,
  });

  const expected = transition.envelope.transaction;

  const system = requireString(
    transaction.system,
    "E1_SYSTEM_REQUIRED",
    "transaction.system"
  );
  if (system !== expected.system) {
    authorityFail(
      "E1_SYSTEM_MISMATCH",
      "actual transaction system differs from the committed transition"
    );
  }

  const chainId = requirePositiveChainId(transaction.chainId);
  if (chainId !== expected.chain_id) {
    authorityFail(
      "E1_CHAIN_ID_MISMATCH",
      "actual chain id differs from the committed transition"
    );
  }

  const executionAccount = requireString(
    transaction.executionAccount,
    "E1_EXECUTION_ACCOUNT_REQUIRED",
    "transaction.executionAccount"
  );
  if (executionAccount !== expected.execution_account) {
    authorityFail(
      "E1_EXECUTION_ACCOUNT_MISMATCH",
      "actual execution account differs from the committed transition"
    );
  }

  const target = requireString(
    transaction.target,
    "E1_TARGET_REQUIRED",
    "transaction.target"
  );
  if (target !== expected.target) {
    authorityFail(
      "E1_TARGET_MISMATCH",
      "actual target differs from the committed transition"
    );
  }

  const calldataSha256 = sha256Bytes(exactCalldataBytes);
  if (calldataSha256 !== expected.calldata_sha256) {
    authorityFail(
      "E1_CALLDATA_DIGEST_MISMATCH",
      "actual calldata bytes differ from the committed transition"
    );
  }

  const nativeValue = requireString(
    transaction.nativeValue,
    "E1_NATIVE_VALUE_REQUIRED",
    "transaction.nativeValue"
  );
  if (nativeValue !== expected.native_value) {
    authorityFail(
      "E1_NATIVE_VALUE_MISMATCH",
      "actual native value differs from the committed transition"
    );
  }

  const reserved = authorityStateStore.reserveTransaction({
    issuerKeyId: warrant.issuerKeyId,
    nonce: warrant.nonce,
    transitionCommitment: warrant.transitionCommitment,
    enforcementDomain: warrant.enforcementDomain,
    warrantBodySha256: warrant.bodySha256,
  });

  if (reserved?.state !== "TX_RESERVED") {
    authorityFail(
      "E1_RESERVATION_STATE_INVALID",
      "S0 did not return TX_RESERVED after transaction reservation"
    );
  }

  return {
    status: "TX_RESERVED",
    transitionCommitment: transition.transitionCommitment,
    warrantIssuerKeyId: warrant.issuerKeyId,
    warrantBodySha256: warrant.bodySha256,
    nonce: warrant.nonce,
    system,
    chainId,
    executionAccount,
    target,
    calldataSha256,
    calldataByteLength: exactCalldataBytes.length,
    nativeValue,
    consumedAt: reserved.consumedAt,
    s0State: reserved.state,
    signatureProduced: false,
    transactionSubmitted: false,
    txHash: null,
  };
}

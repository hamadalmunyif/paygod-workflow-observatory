import { sha256Bytes } from "./digest.mjs";
import { authorityFail } from "./authority-error.mjs";

export const TRANSITION_ENVELOPE_SCHEMA = "paygod/transition-envelope/v0";

const SHA256_HEX = /^[0-9a-f]{64}$/;
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/;
const DECIMAL_UINT = /^(0|[1-9][0-9]*)$/;

function requireString(value, code, label) {
  if (typeof value !== "string" || value.length === 0) {
    authorityFail(code, `${label} must be a non-empty string`);
  }
  return value;
}

function requireSha256(value, code, label) {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    authorityFail(code, `${label} must be 64 lowercase hexadecimal characters`);
  }
  return value;
}

function requireAddress(value, code, label) {
  if (typeof value !== "string" || !EVM_ADDRESS.test(value)) {
    authorityFail(code, `${label} must be a lowercase EVM address`);
  }
  return value;
}

function requirePositiveChainId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    authorityFail("TRANSITION_CHAIN_ID_INVALID", "transaction.chain_id must be a positive safe integer");
  }
  return value;
}

function requireNativeValue(value) {
  if (typeof value !== "string" || !DECIMAL_UINT.test(value)) {
    authorityFail("TRANSITION_NATIVE_VALUE_INVALID", "transaction.native_value must be a base-10 unsigned integer string");
  }
  return value;
}

export function buildTransitionEnvelopeV0({
  requestIdentitySha256,
  transaction,
  payload,
}) {
  const frozen = {
    schema: TRANSITION_ENVELOPE_SCHEMA,
    request_identity_sha256: requireSha256(
      requestIdentitySha256,
      "TRANSITION_REQUEST_IDENTITY_INVALID",
      "request_identity_sha256"
    ),
    transaction: {
      system:
        requireString(
          transaction?.system,
          "TRANSITION_SYSTEM_REQUIRED",
          "transaction.system"
        ) === "evm"
          ? "evm"
          : authorityFail(
              "TRANSITION_SYSTEM_UNSUPPORTED",
              "transaction.system must be evm for v0"
            ),
      chain_id: requirePositiveChainId(transaction?.chainId),
      execution_account: requireAddress(
        transaction?.executionAccount,
        "TRANSITION_EXECUTION_ACCOUNT_INVALID",
        "transaction.execution_account"
      ),
      target: requireAddress(
        transaction?.target,
        "TRANSITION_TARGET_INVALID",
        "transaction.target"
      ),
      calldata_sha256: requireSha256(
        transaction?.calldataSha256,
        "TRANSITION_CALLDATA_DIGEST_INVALID",
        "transaction.calldata_sha256"
      ),
      native_value: requireNativeValue(transaction?.nativeValue),
    },
    payload: {
      channel: requireString(
        payload?.channel,
        "TRANSITION_PAYLOAD_CHANNEL_REQUIRED",
        "payload.channel"
      ),
      recipient: requireAddress(
        payload?.recipient,
        "TRANSITION_PAYLOAD_RECIPIENT_INVALID",
        "payload.recipient"
      ),
      content_type: requireString(
        payload?.contentType,
        "TRANSITION_PAYLOAD_CONTENT_TYPE_REQUIRED",
        "payload.content_type"
      ),
      payload_sha256: requireSha256(
        payload?.payloadSha256,
        "TRANSITION_PAYLOAD_DIGEST_INVALID",
        "payload.payload_sha256"
      ),
    },
  };

  const bytes = Buffer.from(JSON.stringify(frozen), "utf8");
  return {
    schema: TRANSITION_ENVELOPE_SCHEMA,
    envelope: frozen,
    bytes,
    byteLength: bytes.length,
    transitionCommitment: sha256Bytes(bytes),
  };
}

export function parseExactTransitionEnvelopeV0(bytes) {
  const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  let parsed;
  try {
    parsed = JSON.parse(input.toString("utf8"));
  } catch {
    authorityFail("TRANSITION_ENVELOPE_JSON_INVALID", "transition envelope is not valid JSON");
  }

  if (parsed?.schema !== TRANSITION_ENVELOPE_SCHEMA) {
    authorityFail("TRANSITION_ENVELOPE_SCHEMA_MISMATCH", "transition envelope schema must be paygod/transition-envelope/v0");
  }

  const rebuilt = buildTransitionEnvelopeV0({
    requestIdentitySha256: parsed.request_identity_sha256,
    transaction: {
      system: parsed.transaction?.system,
      chainId: parsed.transaction?.chain_id,
      executionAccount: parsed.transaction?.execution_account,
      target: parsed.transaction?.target,
      calldataSha256: parsed.transaction?.calldata_sha256,
      nativeValue: parsed.transaction?.native_value,
    },
    payload: {
      channel: parsed.payload?.channel,
      recipient: parsed.payload?.recipient,
      contentType: parsed.payload?.content_type,
      payloadSha256: parsed.payload?.payload_sha256,
    },
  });

  if (!rebuilt.bytes.equals(input)) {
    authorityFail(
      "TRANSITION_ENVELOPE_BYTE_PROFILE_MISMATCH",
      "transition envelope bytes do not match the frozen v0 byte profile"
    );
  }

  return rebuilt;
}

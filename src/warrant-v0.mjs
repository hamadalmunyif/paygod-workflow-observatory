import {
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { sha256Bytes } from "./digest.mjs";
import { authorityFail } from "./authority-error.mjs";

export const WARRANT_SCHEMA = "paygod/warrant/v0";
export const WARRANT_ALG = "Ed25519";
export const CONTROLLED_ENFORCEMENT_DOMAIN = "controlled-harness/t0-v0";

const SHA256_HEX = /^[0-9a-f]{64}$/;
const NONCE_HEX = /^[0-9a-f]{64}$/;
const ISSUER_KEY_ID = /^ed25519-spki-sha256:[0-9a-f]{64}$/;

function asBuffer(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  authorityFail("WARRANT_BYTES_REQUIRED", `${label} must be explicit bytes or UTF-8 text`);
}

function requireSha256(value, code, label) {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    authorityFail(code, `${label} must be 64 lowercase hexadecimal characters`);
  }
  return value;
}

function requireIssuerKeyId(value) {
  if (typeof value !== "string" || !ISSUER_KEY_ID.test(value)) {
    authorityFail(
      "WARRANT_ISSUER_KEY_ID_INVALID",
      "issuer_key_id must use ed25519-spki-sha256:<64 lowercase hex>"
    );
  }
  return value;
}

function requireTime(value, code, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    authorityFail(code, `${label} must be a non-negative safe integer Unix epoch millisecond value`);
  }
  return value;
}

export function generateIssuerKeyPairV0() {
  return generateKeyPairSync("ed25519");
}

export function exportIssuerPublicKeySpkiDer(publicKey) {
  return Buffer.from(
    publicKey.export({
      type: "spki",
      format: "der",
    })
  );
}

export function issuerKeyIdFromSpkiDer(spkiDer) {
  const bytes = asBuffer(spkiDer, "spkiDer");
  return `ed25519-spki-sha256:${sha256Bytes(bytes)}`;
}

export function issuerKeyIdFromPublicKey(publicKey) {
  return issuerKeyIdFromSpkiDer(exportIssuerPublicKeySpkiDer(publicKey));
}

export function freshWarrantNonceV0() {
  return randomBytes(32).toString("hex");
}

export function buildWarrantBodyV0({
  transitionCommitment,
  notBefore,
  expiresAt,
  nonce,
  issuerKeyId,
  enforcementDomain = CONTROLLED_ENFORCEMENT_DOMAIN,
}) {
  if (typeof enforcementDomain !== "string" || enforcementDomain.length === 0) {
    authorityFail("WARRANT_DOMAIN_REQUIRED", "enforcement_domain must be a non-empty string");
  }
  requireSha256(
    transitionCommitment,
    "WARRANT_TRANSITION_COMMITMENT_INVALID",
    "transition_commitment"
  );
  requireTime(notBefore, "WARRANT_NOT_BEFORE_INVALID", "not_before");
  requireTime(expiresAt, "WARRANT_EXPIRES_AT_INVALID", "expires_at");
  if (expiresAt <= notBefore) {
    authorityFail(
      "WARRANT_TIME_WINDOW_INVALID",
      "expires_at must be greater than not_before"
    );
  }
  if (typeof nonce !== "string" || !NONCE_HEX.test(nonce)) {
    authorityFail("WARRANT_NONCE_INVALID", "nonce must be 32 bytes encoded as 64 lowercase hex");
  }
  requireIssuerKeyId(issuerKeyId);

  const body = {
    schema: WARRANT_SCHEMA,
    enforcement_domain: enforcementDomain,
    transition_commitment: transitionCommitment,
    not_before: notBefore,
    expires_at: expiresAt,
    nonce,
    issuer_key_id: issuerKeyId,
  };
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  return {
    body,
    bytes,
    byteLength: bytes.length,
    bodySha256: sha256Bytes(bytes),
  };
}

export function parseExactWarrantBodyV0(bytes) {
  const input = asBuffer(bytes, "warrant body");
  let parsed;
  try {
    parsed = JSON.parse(input.toString("utf8"));
  } catch {
    authorityFail("WARRANT_BODY_JSON_INVALID", "warrant body is not valid JSON");
  }
  if (parsed?.schema !== WARRANT_SCHEMA) {
    authorityFail("WARRANT_SCHEMA_MISMATCH", "warrant schema must be paygod/warrant/v0");
  }

  const rebuilt = buildWarrantBodyV0({
    transitionCommitment: parsed.transition_commitment,
    notBefore: parsed.not_before,
    expiresAt: parsed.expires_at,
    nonce: parsed.nonce,
    issuerKeyId: parsed.issuer_key_id,
    enforcementDomain: parsed.enforcement_domain,
  });

  if (!rebuilt.bytes.equals(input)) {
    authorityFail(
      "WARRANT_BODY_BYTE_PROFILE_MISMATCH",
      "warrant body bytes do not match the frozen v0 byte profile"
    );
  }
  return rebuilt;
}

export function buildWarrantSignatureArtifactV0({
  issuerKeyId,
  signature,
}) {
  requireIssuerKeyId(issuerKeyId);
  const signatureBytes = asBuffer(signature, "signature");
  if (signatureBytes.length !== 64) {
    authorityFail("WARRANT_SIGNATURE_LENGTH_INVALID", "Ed25519 signature must be 64 bytes");
  }

  const artifact = {
    alg: WARRANT_ALG,
    issuer_key_id: issuerKeyId,
    signature_base64: signatureBytes.toString("base64"),
  };
  const bytes = Buffer.from(JSON.stringify(artifact), "utf8");
  return { artifact, bytes, byteLength: bytes.length };
}

export function parseExactWarrantSignatureArtifactV0(bytes) {
  const input = asBuffer(bytes, "warrant signature artifact");
  let parsed;
  try {
    parsed = JSON.parse(input.toString("utf8"));
  } catch {
    authorityFail("WARRANT_SIGNATURE_JSON_INVALID", "warrant.sig is not valid JSON");
  }
  if (parsed?.alg !== WARRANT_ALG) {
    authorityFail("WARRANT_SIGNATURE_ALG_MISMATCH", "warrant.sig alg must be Ed25519");
  }

  let signature;
  try {
    signature = Buffer.from(parsed.signature_base64, "base64");
  } catch {
    authorityFail("WARRANT_SIGNATURE_BASE64_INVALID", "signature_base64 is invalid");
  }
  const rebuilt = buildWarrantSignatureArtifactV0({
    issuerKeyId: parsed.issuer_key_id,
    signature,
  });
  if (!rebuilt.bytes.equals(input)) {
    authorityFail(
      "WARRANT_SIGNATURE_BYTE_PROFILE_MISMATCH",
      "warrant.sig bytes do not match the frozen v0 byte profile"
    );
  }
  return { ...rebuilt, signature };
}

export function signWarrantBodyV0({
  bodyBytes,
  privateKey,
  publicKey,
}) {
  const parsed = parseExactWarrantBodyV0(bodyBytes);
  const expectedIssuerKeyId = issuerKeyIdFromPublicKey(publicKey);
  if (parsed.body.issuer_key_id !== expectedIssuerKeyId) {
    authorityFail(
      "WARRANT_ISSUER_KEY_MISMATCH",
      "warrant issuer_key_id does not match the signing public key"
    );
  }

  const signature = cryptoSign(null, parsed.bytes, privateKey);
  const signatureArtifact = buildWarrantSignatureArtifactV0({
    issuerKeyId: expectedIssuerKeyId,
    signature,
  });

  return {
    body: parsed.body,
    bodyBytes: parsed.bytes,
    bodySha256: parsed.bodySha256,
    signature,
    signatureArtifact: signatureArtifact.artifact,
    signatureBytes: signatureArtifact.bytes,
  };
}

function trustedDerForId(trustedIssuers, issuerKeyId) {
  if (trustedIssuers instanceof Map) return trustedIssuers.get(issuerKeyId);
  if (trustedIssuers && typeof trustedIssuers === "object") {
    return trustedIssuers[issuerKeyId];
  }
  return undefined;
}

export function verifyWarrantV0({
  bodyBytes,
  signatureBytes,
  trustedIssuers,
  expectedDomain = CONTROLLED_ENFORCEMENT_DOMAIN,
  expectedTransitionCommitment = null,
  nowMs,
}) {
  const body = parseExactWarrantBodyV0(bodyBytes);
  const sig = parseExactWarrantSignatureArtifactV0(signatureBytes);

  if (body.body.enforcement_domain !== expectedDomain) {
    authorityFail(
      "WARRANT_DOMAIN_MISMATCH",
      "warrant enforcement_domain does not match verifier domain"
    );
  }
  if (
    expectedTransitionCommitment !== null &&
    body.body.transition_commitment !== expectedTransitionCommitment
  ) {
    authorityFail(
      "WARRANT_TRANSITION_COMMITMENT_MISMATCH",
      "warrant transition_commitment does not match the expected transition"
    );
  }
  if (sig.artifact.issuer_key_id !== body.body.issuer_key_id) {
    authorityFail(
      "WARRANT_SIGNATURE_ISSUER_MISMATCH",
      "warrant.sig issuer_key_id does not match warrant-body issuer_key_id"
    );
  }

  const trustedDer = trustedDerForId(trustedIssuers, body.body.issuer_key_id);
  if (!trustedDer) {
    authorityFail("WARRANT_ISSUER_UNTRUSTED", "issuer_key_id is not in the trusted issuer set");
  }

  const derBytes = asBuffer(trustedDer, "trusted issuer DER");
  const recomputedId = issuerKeyIdFromSpkiDer(derBytes);
  if (recomputedId !== body.body.issuer_key_id) {
    authorityFail(
      "WARRANT_TRUST_RECORD_MISMATCH",
      "trusted issuer public key bytes do not match issuer_key_id"
    );
  }

  const publicKey = createPublicKey({
    key: derBytes,
    format: "der",
    type: "spki",
  });
  const ok = cryptoVerify(null, body.bytes, publicKey, sig.signature);
  if (!ok) {
    authorityFail("WARRANT_SIGNATURE_INVALID", "warrant signature verification failed");
  }

  requireTime(nowMs, "WARRANT_NOW_INVALID", "nowMs");
  if (nowMs < body.body.not_before) {
    authorityFail("WARRANT_NOT_YET_VALID", "warrant is not yet valid");
  }
  if (nowMs >= body.body.expires_at) {
    authorityFail("WARRANT_EXPIRED", "warrant has expired");
  }

  return {
    status: "VALID",
    schema: WARRANT_SCHEMA,
    enforcementDomain: body.body.enforcement_domain,
    transitionCommitment: body.body.transition_commitment,
    nonce: body.body.nonce,
    issuerKeyId: body.body.issuer_key_id,
    notBefore: body.body.not_before,
    expiresAt: body.body.expires_at,
    bodySha256: body.bodySha256,
  };
}

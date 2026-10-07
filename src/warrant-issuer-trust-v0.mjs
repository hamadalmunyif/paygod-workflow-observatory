import { createPrivateKey, createPublicKey } from "node:crypto";

import { authorityFail } from "./authority-error.mjs";
import { sha256Bytes } from "./digest.mjs";
import {
  CONTROLLED_ENFORCEMENT_DOMAIN,
  exportIssuerPublicKeySpkiDer,
  issuerKeyIdFromPublicKey,
} from "./warrant-v0.mjs";

export const WARRANT_ISSUER_TRUST_SCHEMA =
  "workflow-observatory/warrant-issuer-trust/v0";

function requireObject(value, code, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    authorityFail(code, label + " must be an object");
  }
  return value;
}

function exactBase64Bytes(value, code, label) {
  if (typeof value !== "string" || value.length === 0) {
    authorityFail(code, label + " must be non-empty base64");
  }
  let bytes;
  try {
    bytes = Buffer.from(value, "base64");
  } catch {
    authorityFail(code, label + " is not valid base64");
  }
  if (bytes.length === 0 || bytes.toString("base64") !== value) {
    authorityFail(code, label + " is not exact canonical base64");
  }
  return bytes;
}

export function buildWarrantIssuerTrustStoreV0({
  publicKey,
  enforcementDomain = CONTROLLED_ENFORCEMENT_DOMAIN,
}) {
  if (!publicKey || publicKey.asymmetricKeyType !== "ed25519") {
    authorityFail(
      "WARRANT_TRUST_PUBLIC_KEY_TYPE_INVALID",
      "Warrant issuer trust key must be Ed25519"
    );
  }
  if (typeof enforcementDomain !== "string" || enforcementDomain.length === 0) {
    authorityFail(
      "WARRANT_TRUST_DOMAIN_REQUIRED",
      "enforcement domain is required"
    );
  }

  const spkiDer = exportIssuerPublicKeySpkiDer(publicKey);
  const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
  const trust = {
    schema: WARRANT_ISSUER_TRUST_SCHEMA,
    enforcement_domain: enforcementDomain,
    keys: [
      {
        issuer_key_id: issuerKeyId,
        algorithm: "Ed25519",
        public_key_spki_der_base64: spkiDer.toString("base64"),
      },
    ],
  };
  const bytes = Buffer.from(JSON.stringify(trust) + "\n", "utf8");
  return {
    trust,
    bytes,
    sha256: sha256Bytes(bytes),
    issuerKeyId,
    publicKeySpkiDer: spkiDer,
  };
}

export function resolveWarrantIssuerFromExternalTrustV0({
  privateKeyPem,
  trustStore,
  trustStoreBytes = null,
  expectedDomain = CONTROLLED_ENFORCEMENT_DOMAIN,
}) {
  const trust = requireObject(
    trustStore,
    "WARRANT_TRUST_STORE_REQUIRED",
    "warrant issuer trust store"
  );
  if (trust.schema !== WARRANT_ISSUER_TRUST_SCHEMA) {
    authorityFail(
      "WARRANT_TRUST_SCHEMA_MISMATCH",
      "Warrant issuer trust schema mismatch"
    );
  }
  if (trust.enforcement_domain !== expectedDomain) {
    authorityFail(
      "WARRANT_TRUST_DOMAIN_MISMATCH",
      "Warrant issuer trust domain mismatch"
    );
  }
  if (!Array.isArray(trust.keys) || trust.keys.length === 0) {
    authorityFail(
      "WARRANT_TRUST_KEYS_REQUIRED",
      "Warrant issuer trust store must contain keys"
    );
  }

  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch {
    authorityFail(
      "WARRANT_ISSUER_PRIVATE_KEY_INVALID",
      "Warrant issuer private key is invalid"
    );
  }
  if (privateKey.asymmetricKeyType !== "ed25519") {
    authorityFail(
      "WARRANT_ISSUER_PRIVATE_KEY_TYPE_INVALID",
      "Warrant issuer private key must be Ed25519"
    );
  }

  const publicKey = createPublicKey(privateKey);
  const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
  const derivedSpki = exportIssuerPublicKeySpkiDer(publicKey);

  const entry = trust.keys.find(
    (item) => item?.issuer_key_id === issuerKeyId
  );
  if (!entry) {
    authorityFail(
      "WARRANT_ISSUER_NOT_EXTERNALLY_TRUSTED",
      "private key public identity is absent from external Warrant issuer trust store"
    );
  }
  if (entry.algorithm !== "Ed25519") {
    authorityFail(
      "WARRANT_TRUST_ALGORITHM_MISMATCH",
      "trusted Warrant issuer algorithm must be Ed25519"
    );
  }
  const trustedSpki = exactBase64Bytes(
    entry.public_key_spki_der_base64,
    "WARRANT_TRUST_PUBLIC_KEY_INVALID",
    "public_key_spki_der_base64"
  );
  if (!trustedSpki.equals(derivedSpki)) {
    authorityFail(
      "WARRANT_TRUST_PUBLIC_KEY_MISMATCH",
      "external trust key bytes do not match issuer private key"
    );
  }

  const exactTrustBytes =
    trustStoreBytes === null
      ? Buffer.from(JSON.stringify(trust) + "\n", "utf8")
      : Buffer.from(trustStoreBytes);

  return {
    privateKey,
    publicKey,
    issuerKeyId,
    publicKeySpkiDer: derivedSpki,
    trustStoreSha256: sha256Bytes(exactTrustBytes),
    enforcementDomain: trust.enforcement_domain,
  };
}

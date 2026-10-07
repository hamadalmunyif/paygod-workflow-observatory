import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import { AuthorityError } from "../src/authority-error.mjs";
import { generateIssuerKeyPairV0 } from "../src/warrant-v0.mjs";
import {
  buildWarrantIssuerTrustStoreV0,
  resolveWarrantIssuerFromExternalTrustV0,
  trustedWarrantIssuersFromExternalTrustV0,
} from "../src/warrant-issuer-trust-v0.mjs";

function expectCode(fn, code) {
  assert.throws(
    fn,
    (err) => err instanceof AuthorityError && err.code === code
  );
}

function privatePem(privateKey) {
  return privateKey.export({ type: "pkcs8", format: "pem" });
}

test("external Warrant issuer trust resolves matching Ed25519 private key", () => {
  const { publicKey, privateKey } = generateIssuerKeyPairV0();
  const built = buildWarrantIssuerTrustStoreV0({ publicKey });

  const resolved = resolveWarrantIssuerFromExternalTrustV0({
    privateKeyPem: privatePem(privateKey),
    trustStore: built.trust,
    trustStoreBytes: built.bytes,
  });

  assert.equal(resolved.issuerKeyId, built.issuerKeyId);
  assert.equal(resolved.trustStoreSha256, built.sha256);
  assert.equal(resolved.enforcementDomain, "controlled-harness/t0-v0");
  assert.equal(resolved.publicKey.asymmetricKeyType, "ed25519");
});

test("issuer private key absent from external trust store is rejected", () => {
  const pairA = generateIssuerKeyPairV0();
  const pairB = generateIssuerKeyPairV0();
  const built = buildWarrantIssuerTrustStoreV0({
    publicKey: pairB.publicKey,
  });

  expectCode(
    () =>
      resolveWarrantIssuerFromExternalTrustV0({
        privateKeyPem: privatePem(pairA.privateKey),
        trustStore: built.trust,
        trustStoreBytes: built.bytes,
      }),
    "WARRANT_ISSUER_NOT_EXTERNALLY_TRUSTED"
  );
});

test("wrong Warrant trust domain is rejected", () => {
  const pair = generateIssuerKeyPairV0();
  const built = buildWarrantIssuerTrustStoreV0({
    publicKey: pair.publicKey,
    enforcementDomain: "wrong-domain",
  });

  expectCode(
    () =>
      resolveWarrantIssuerFromExternalTrustV0({
        privateKeyPem: privatePem(pair.privateKey),
        trustStore: built.trust,
        trustStoreBytes: built.bytes,
      }),
    "WARRANT_TRUST_DOMAIN_MISMATCH"
  );
});

test("trusted issuer algorithm drift is rejected", () => {
  const pair = generateIssuerKeyPairV0();
  const built = buildWarrantIssuerTrustStoreV0({
    publicKey: pair.publicKey,
  });
  const trust = structuredClone(built.trust);
  trust.keys[0].algorithm = "P-256";

  expectCode(
    () =>
      resolveWarrantIssuerFromExternalTrustV0({
        privateKeyPem: privatePem(pair.privateKey),
        trustStore: trust,
      }),
    "WARRANT_TRUST_ALGORITHM_MISMATCH"
  );
});

test("trusted public-key bytes must match the issuer private key", () => {
  const pairA = generateIssuerKeyPairV0();
  const pairB = generateIssuerKeyPairV0();
  const builtA = buildWarrantIssuerTrustStoreV0({
    publicKey: pairA.publicKey,
  });
  const builtB = buildWarrantIssuerTrustStoreV0({
    publicKey: pairB.publicKey,
  });
  const trust = structuredClone(builtA.trust);
  trust.keys[0].public_key_spki_der_base64 =
    builtB.trust.keys[0].public_key_spki_der_base64;

  expectCode(
    () =>
      resolveWarrantIssuerFromExternalTrustV0({
        privateKeyPem: privatePem(pairA.privateKey),
        trustStore: trust,
      }),
    "WARRANT_TRUST_PUBLIC_KEY_MISMATCH"
  );
});

test("non-Ed25519 Warrant issuer private key is rejected", () => {
  const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const trusted = generateIssuerKeyPairV0();
  const built = buildWarrantIssuerTrustStoreV0({
    publicKey: trusted.publicKey,
  });

  expectCode(
    () =>
      resolveWarrantIssuerFromExternalTrustV0({
        privateKeyPem: privatePem(ec.privateKey),
        trustStore: built.trust,
      }),
    "WARRANT_ISSUER_PRIVATE_KEY_TYPE_INVALID"
  );
});


test("external trust store builds verifier map from exact SPKI identity", () => {
  const pair = generateIssuerKeyPairV0();
  const built = buildWarrantIssuerTrustStoreV0({ publicKey: pair.publicKey });

  const resolved = trustedWarrantIssuersFromExternalTrustV0({
    trustStore: built.trust,
    trustStoreBytes: built.bytes,
  });

  assert.equal(resolved.issuerKeyIds.length, 1);
  assert.equal(resolved.issuerKeyIds[0], built.issuerKeyId);
  assert.equal(resolved.trustStoreSha256, built.sha256);
  assert.equal(resolved.trustedIssuers.has(built.issuerKeyId), true);
});

test("external trust store rejects key id that does not match SPKI bytes", () => {
  const pairA = generateIssuerKeyPairV0();
  const pairB = generateIssuerKeyPairV0();
  const builtA = buildWarrantIssuerTrustStoreV0({ publicKey: pairA.publicKey });
  const builtB = buildWarrantIssuerTrustStoreV0({ publicKey: pairB.publicKey });
  const trust = structuredClone(builtA.trust);
  trust.keys[0].issuer_key_id = builtB.issuerKeyId;

  expectCode(
    () =>
      trustedWarrantIssuersFromExternalTrustV0({
        trustStore: trust,
      }),
    "WARRANT_TRUST_KEY_ID_MISMATCH"
  );
});

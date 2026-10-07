import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";

import { AuthorityError } from "../src/authority-error.mjs";
import { sha256Bytes } from "../src/digest.mjs";
import {
  buildTransitionEnvelopeV0,
  parseExactTransitionEnvelopeV0,
} from "../src/transition-envelope-v0.mjs";
import {
  CONTROLLED_ENFORCEMENT_DOMAIN,
  buildWarrantBodyV0,
  exportIssuerPublicKeySpkiDer,
  freshWarrantNonceV0,
  generateIssuerKeyPairV0,
  issuerKeyIdFromPublicKey,
  signWarrantBodyV0,
  verifyWarrantV0,
} from "../src/warrant-v0.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";

function expectCode(fn, code) {
  assert.throws(
    fn,
    (err) => err instanceof AuthorityError && err.code === code
  );
}

const requestIdentitySha256 = "11".repeat(32);
const calldataSha256 = "22".repeat(32);
const payloadBytes = Buffer.from('{"company":"Example"}', "utf8");
const payloadSha256 = sha256Bytes(payloadBytes);
const executionAccount = "0x" + "44".repeat(20);
const target = "0x" + "55".repeat(20);
const provider = "0x" + "66".repeat(20);

function baselineTransition(overrides = {}) {
  return buildTransitionEnvelopeV0({
    requestIdentitySha256,
    transaction: {
      system: "evm",
      chainId: 31337,
      executionAccount,
      target,
      calldataSha256,
      nativeValue: "0",
      ...(overrides.transaction ?? {}),
    },
    payload: {
      channel: "controlled-requirement-message/v0",
      recipient: provider,
      contentType: "requirement",
      payloadSha256,
      ...(overrides.payload ?? {}),
    },
  });
}

test("transition envelope v0 freezes exact compact byte profile", () => {
  const result = baselineTransition();
  const expected =
    '{"schema":"paygod/transition-envelope/v0",' +
    '"request_identity_sha256":"' + requestIdentitySha256 + '",' +
    '"transaction":{"system":"evm","chain_id":31337,' +
    '"execution_account":"' + executionAccount + '",' +
    '"target":"' + target + '",' +
    '"calldata_sha256":"' + calldataSha256 + '",' +
    '"native_value":"0"},' +
    '"payload":{"channel":"controlled-requirement-message/v0",' +
    '"recipient":"' + provider + '",' +
    '"content_type":"requirement",' +
    '"payload_sha256":"' + payloadSha256 + '"}}';

  assert.equal(result.bytes.toString("utf8"), expected);
  assert.equal(result.transitionCommitment, sha256Bytes(Buffer.from(expected)));
  assert.equal(parseExactTransitionEnvelopeV0(result.bytes).transitionCommitment, result.transitionCommitment);
});

test("same semantic envelope with pretty serialization is not byte-exact v0", () => {
  const result = baselineTransition();
  const pretty = Buffer.from(JSON.stringify(result.envelope, null, 2), "utf8");
  expectCode(
    () => parseExactTransitionEnvelopeV0(pretty),
    "TRANSITION_ENVELOPE_BYTE_PROFILE_MISMATCH"
  );
});

test("execution account and payload recipient are commitment-bearing", () => {
  const base = baselineTransition();
  const otherAccount = baselineTransition({
    transaction: { executionAccount: "0x" + "77".repeat(20) },
  });
  const otherRecipient = baselineTransition({
    payload: { recipient: "0x" + "88".repeat(20) },
  });

  assert.notEqual(base.transitionCommitment, otherAccount.transitionCommitment);
  assert.notEqual(base.transitionCommitment, otherRecipient.transitionCommitment);
});

test("warrant v0 signs exact body bytes and verifies against pinned issuer", () => {
  const transition = baselineTransition();
  const { publicKey, privateKey } = generateIssuerKeyPairV0();
  const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
  const nonce = "99".repeat(32);
  const body = buildWarrantBodyV0({
    transitionCommitment: transition.transitionCommitment,
    notBefore: 1_800_000_000_000,
    expiresAt: 1_800_000_060_000,
    nonce,
    issuerKeyId,
  });
  const signed = signWarrantBodyV0({
    bodyBytes: body.bytes,
    privateKey,
    publicKey,
  });
  const trusted = new Map([
    [issuerKeyId, exportIssuerPublicKeySpkiDer(publicKey)],
  ]);

  const verified = verifyWarrantV0({
    bodyBytes: body.bytes,
    signatureBytes: signed.signatureBytes,
    trustedIssuers: trusted,
    expectedTransitionCommitment: transition.transitionCommitment,
    nowMs: 1_800_000_001_000,
  });

  assert.equal(verified.status, "VALID");
  assert.equal(verified.enforcementDomain, CONTROLLED_ENFORCEMENT_DOMAIN);
  assert.equal(verified.transitionCommitment, transition.transitionCommitment);
  assert.equal(verified.nonce, nonce);
  assert.equal(verified.issuerKeyId, issuerKeyId);
});

test("warrant verifier rejects altered exact body bytes", () => {
  const transition = baselineTransition();
  const { publicKey, privateKey } = generateIssuerKeyPairV0();
  const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
  const body = buildWarrantBodyV0({
    transitionCommitment: transition.transitionCommitment,
    notBefore: 1_800_000_000_000,
    expiresAt: 1_800_000_060_000,
    nonce: "aa".repeat(32),
    issuerKeyId,
  });
  const signed = signWarrantBodyV0({ bodyBytes: body.bytes, privateKey, publicKey });
  const parsed = JSON.parse(body.bytes.toString("utf8"));
  parsed.expires_at += 1000;
  const altered = Buffer.from(JSON.stringify(parsed), "utf8");
  const trusted = new Map([
    [issuerKeyId, exportIssuerPublicKeySpkiDer(publicKey)],
  ]);

  expectCode(
    () =>
      verifyWarrantV0({
        bodyBytes: altered,
        signatureBytes: signed.signatureBytes,
        trustedIssuers: trusted,
        nowMs: 1_800_000_001_000,
      }),
    "WARRANT_SIGNATURE_INVALID"
  );
});

test("warrant verifier rejects pretty-body representation before authority checks", () => {
  const transition = baselineTransition();
  const { publicKey } = generateIssuerKeyPairV0();
  const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
  const body = buildWarrantBodyV0({
    transitionCommitment: transition.transitionCommitment,
    notBefore: 1_800_000_000_000,
    expiresAt: 1_800_000_060_000,
    nonce: "ab".repeat(32),
    issuerKeyId,
  });
  const pretty = Buffer.from(JSON.stringify(body.body, null, 2), "utf8");

  // Import-free assertion of the body parser through signing: the exact profile
  // check occurs before any signature can be produced.
  const { privateKey } = generateIssuerKeyPairV0();
  expectCode(
    () => signWarrantBodyV0({ bodyBytes: pretty, privateKey, publicKey }),
    "WARRANT_BODY_BYTE_PROFILE_MISMATCH"
  );
});

test("warrant verifier rejects wrong domain, unknown issuer, early use and expiry", () => {
  const transition = baselineTransition();
  const { publicKey, privateKey } = generateIssuerKeyPairV0();
  const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
  const body = buildWarrantBodyV0({
    transitionCommitment: transition.transitionCommitment,
    notBefore: 1_800_000_010_000,
    expiresAt: 1_800_000_020_000,
    nonce: "bb".repeat(32),
    issuerKeyId,
  });
  const signed = signWarrantBodyV0({ bodyBytes: body.bytes, privateKey, publicKey });
  const trusted = new Map([
    [issuerKeyId, exportIssuerPublicKeySpkiDer(publicKey)],
  ]);

  expectCode(
    () =>
      verifyWarrantV0({
        bodyBytes: body.bytes,
        signatureBytes: signed.signatureBytes,
        trustedIssuers: trusted,
        expectedDomain: "wrong-domain",
        nowMs: 1_800_000_015_000,
      }),
    "WARRANT_DOMAIN_MISMATCH"
  );

  expectCode(
    () =>
      verifyWarrantV0({
        bodyBytes: body.bytes,
        signatureBytes: signed.signatureBytes,
        trustedIssuers: new Map(),
        nowMs: 1_800_000_015_000,
      }),
    "WARRANT_ISSUER_UNTRUSTED"
  );

  expectCode(
    () =>
      verifyWarrantV0({
        bodyBytes: body.bytes,
        signatureBytes: signed.signatureBytes,
        trustedIssuers: trusted,
        nowMs: 1_800_000_009_999,
      }),
    "WARRANT_NOT_YET_VALID"
  );

  expectCode(
    () =>
      verifyWarrantV0({
        bodyBytes: body.bytes,
        signatureBytes: signed.signatureBytes,
        trustedIssuers: trusted,
        nowMs: 1_800_000_020_000,
      }),
    "WARRANT_EXPIRED"
  );
});


test("warrant v0 rejects non-Ed25519 issuer public keys", () => {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  expectCode(
    () => issuerKeyIdFromPublicKey(publicKey),
    "WARRANT_ISSUER_KEY_TYPE_INVALID"
  );
});

let sqliteAvailable = false;
try {
  await import("node:sqlite");
  sqliteAvailable = true;
} catch {
  sqliteAvailable = false;
}

test(
  "reference authority harness runtime exposes node:sqlite on Node 22+",
  { skip: Number(process.versions.node.split(".")[0]) < 22 },
  () => {
    assert.equal(sqliteAvailable, true);
  }
);

test(
  "S0 persists nonce consumption across restart and rejects replay",
  { skip: !sqliteAvailable },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paygod-s0-"));
    const dbPath = path.join(dir, "authority.db");
    let now = 1_800_000_000_000;

    const transition = baselineTransition();
    const { publicKey } = generateIssuerKeyPairV0();
    const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
    const nonce = freshWarrantNonceV0();
    const warrant = buildWarrantBodyV0({
      transitionCommitment: transition.transitionCommitment,
      notBefore: now,
      expiresAt: now + 60_000,
      nonce,
      issuerKeyId,
    });

    let store = await openAuthorityStateStoreV0(dbPath, { now: () => now });
    const issued = store.registerIssued({
      issuerKeyId,
      nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
      notBefore: warrant.body.not_before,
      expiresAt: warrant.body.expires_at,
      warrantBodySha256: warrant.bodySha256,
    });
    assert.equal(issued.state, "ISSUED");

    expectCode(
      () =>
        store.registerIssued({
          issuerKeyId,
          nonce,
          transitionCommitment: transition.transitionCommitment,
          enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
          notBefore: warrant.body.not_before,
          expiresAt: warrant.body.expires_at,
          warrantBodySha256: warrant.bodySha256,
        }),
      "S0_NONCE_ALREADY_REGISTERED"
    );

    const staged = store.stagePayloadExact({
      issuerKeyId,
      nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
      warrantBodySha256: warrant.bodySha256,
      payloadBytes,
      payloadChannel: "controlled-requirement-message/v0",
      payloadRecipient: provider,
      payloadContentType: "requirement",
    });
    assert.equal(staged.state.state, "PAYLOAD_STAGED");
    assert.equal(staged.stage.payloadSha256, payloadSha256);
    assert.ok(staged.stage.payloadBytes.equals(payloadBytes));

    const reserved = store.reserveTransaction({
      issuerKeyId,
      nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
          warrantBodySha256: warrant.bodySha256,
    });
    assert.equal(reserved.state, "TX_RESERVED");
    assert.equal(reserved.consumedAt, now);

    store.close();
    store = await openAuthorityStateStoreV0(dbPath, { now: () => now });

    const afterRestart = store.get({ issuerKeyId, nonce });
    assert.equal(afterRestart.state, "TX_RESERVED");
    assert.equal(afterRestart.transitionCommitment, transition.transitionCommitment);

    expectCode(
      () =>
        store.reserveTransaction({
          issuerKeyId,
          nonce,
          transitionCommitment: transition.transitionCommitment,
          enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
          warrantBodySha256: warrant.bodySha256,
        }),
      "S0_STATE_INVALID"
    );

    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
);

test(
  "S0 rejects expiry, wrong binding, and changed payload release",
  { skip: !sqliteAvailable },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paygod-s0-"));
    const dbPath = path.join(dir, "authority.db");
    let now = 1_800_000_000_000;

    const transition = baselineTransition();
    const { publicKey } = generateIssuerKeyPairV0();
    const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
    const nonce = "cc".repeat(32);
    const warrant = buildWarrantBodyV0({
      transitionCommitment: transition.transitionCommitment,
      notBefore: now,
      expiresAt: now + 1_000,
      nonce,
      issuerKeyId,
    });

    const store = await openAuthorityStateStoreV0(dbPath, { now: () => now });
    store.registerIssued({
      issuerKeyId,
      nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
      notBefore: warrant.body.not_before,
      expiresAt: warrant.body.expires_at,
      warrantBodySha256: warrant.bodySha256,
    });

    expectCode(
      () =>
        store.stagePayloadExact({
          issuerKeyId,
          nonce,
          transitionCommitment: "dd".repeat(32),
          enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
      warrantBodySha256: warrant.bodySha256,
          payloadBytes,
          payloadChannel: "controlled-requirement-message/v0",
          payloadRecipient: provider,
          payloadContentType: "requirement",
        }),
      "S0_TRANSITION_COMMITMENT_MISMATCH"
    );

    now += 2_000;
    expectCode(
      () =>
        store.stagePayloadExact({
          issuerKeyId,
          nonce,
          transitionCommitment: transition.transitionCommitment,
          enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
      warrantBodySha256: warrant.bodySha256,
          payloadBytes,
          payloadChannel: "controlled-requirement-message/v0",
          payloadRecipient: provider,
          payloadContentType: "requirement",
        }),
      "S0_WARRANT_EXPIRED"
    );

    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
);

test(
  "S0 rejects a warrant body digest different from the registered body",
  { skip: !sqliteAvailable },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paygod-s0-"));
    const dbPath = path.join(dir, "authority.db");
    const now = 1_800_000_000_000;

    const transition = baselineTransition();
    const { publicKey } = generateIssuerKeyPairV0();
    const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
    const nonce = "cd".repeat(32);
    const warrant = buildWarrantBodyV0({
      transitionCommitment: transition.transitionCommitment,
      notBefore: now,
      expiresAt: now + 60_000,
      nonce,
      issuerKeyId,
    });

    const store = await openAuthorityStateStoreV0(dbPath, { now: () => now });
    store.registerIssued({
      issuerKeyId,
      nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
      notBefore: warrant.body.not_before,
      expiresAt: warrant.body.expires_at,
      warrantBodySha256: warrant.bodySha256,
    });

    expectCode(
      () =>
        store.stagePayloadExact({
          issuerKeyId,
          nonce,
          transitionCommitment: transition.transitionCommitment,
          enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
          warrantBodySha256: "de".repeat(32),
          payloadBytes,
          payloadChannel: "controlled-requirement-message/v0",
          payloadRecipient: provider,
          payloadContentType: "requirement",
        }),
      "S0_WARRANT_BODY_DIGEST_MISMATCH"
    );

    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
);

test(
  "S0 logical lifecycle preserves staged payload identity",
  { skip: !sqliteAvailable },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paygod-s0-"));
    const dbPath = path.join(dir, "authority.db");
    const now = 1_800_000_000_000;

    const transition = baselineTransition();
    const { publicKey } = generateIssuerKeyPairV0();
    const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
    const nonce = "ee".repeat(32);
    const warrant = buildWarrantBodyV0({
      transitionCommitment: transition.transitionCommitment,
      notBefore: now,
      expiresAt: now + 60_000,
      nonce,
      issuerKeyId,
    });

    const store = await openAuthorityStateStoreV0(dbPath, { now: () => now });
    store.registerIssued({
      issuerKeyId,
      nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
      notBefore: warrant.body.not_before,
      expiresAt: warrant.body.expires_at,
      warrantBodySha256: warrant.bodySha256,
    });
    store.stagePayloadExact({
      issuerKeyId,
      nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
      warrantBodySha256: warrant.bodySha256,
      payloadBytes,
      payloadChannel: "controlled-requirement-message/v0",
      payloadRecipient: provider,
      payloadContentType: "requirement",
    });
    store.reserveTransaction({
      issuerKeyId,
      nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
          warrantBodySha256: warrant.bodySha256,
    });
    store.markTxExecuted({
      issuerKeyId,
      nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
      txEvidenceSha256: "ff".repeat(32),
    });

    expectCode(
      () =>
        store.releasePayload({
          issuerKeyId,
          nonce,
          transitionCommitment: transition.transitionCommitment,
          enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
          payloadSha256: "12".repeat(32),
        }),
      "S0_STAGED_PAYLOAD_MISMATCH"
    );

    const released = store.releasePayload({
      issuerKeyId,
      nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
      payloadSha256,
    });
    assert.equal(released.state, "PAYLOAD_RELEASED");

    const conformant = store.markConformant({
      issuerKeyId,
      nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
    });
    assert.equal(conformant.state, "CONFORMANT");

    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
);

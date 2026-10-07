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
  buildWarrantSignatureArtifactV0,
  exportIssuerPublicKeySpkiDer,
  generateIssuerKeyPairV0,
  issuerKeyIdFromPublicKey,
  signWarrantBodyV0,
} from "../src/warrant-v0.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { stagePayloadThroughE2V0 } from "../src/e2-payload-gate-v0.mjs";

function expectCode(fn, code) {
  assert.throws(
    fn,
    (err) => err instanceof AuthorityError && err.code === code
  );
}

const payloadBytes = Buffer.from('{"company":"Example"}', "utf8");
const payloadSha256 = sha256Bytes(payloadBytes);
const recipient = "0x" + "66".repeat(20);

function transition(overrides = {}) {
  return buildTransitionEnvelopeV0({
    requestIdentitySha256: "11".repeat(32),
    transaction: {
      system: "evm",
      chainId: 31337,
      executionAccount: "0x" + "44".repeat(20),
      target: overrides.target ?? "0x" + "55".repeat(20),
      calldataSha256: "22".repeat(32),
      nativeValue: "0",
    },
    payload: {
      channel: "controlled-requirement-message/v0",
      recipient: overrides.recipient ?? recipient,
      contentType: overrides.contentType ?? "requirement",
      payloadSha256: overrides.payloadSha256 ?? payloadSha256,
    },
  });
}

let sqliteAvailable = false;
try {
  await import("node:sqlite");
  sqliteAvailable = true;
} catch {
  sqliteAvailable = false;
}

async function fixture({
  now = 1_800_000_000_000,
  notBefore = null,
  expiresAt = null,
  enforcementDomain = CONTROLLED_ENFORCEMENT_DOMAIN,
  register = true,
} = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paygod-e2-"));
  const dbPath = path.join(dir, "authority.db");
  let clock = now;
  const store = await openAuthorityStateStoreV0(dbPath, { now: () => clock });
  const tx = transition();
  const { publicKey, privateKey } = generateIssuerKeyPairV0();
  const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
  const body = buildWarrantBodyV0({
    transitionCommitment: tx.transitionCommitment,
    notBefore: notBefore ?? now,
    expiresAt: expiresAt ?? now + 60_000,
    nonce: "99".repeat(32),
    issuerKeyId,
    enforcementDomain,
  });
  const signed = signWarrantBodyV0({
    bodyBytes: body.bytes,
    privateKey,
    publicKey,
  });
  const trusted = new Map([
    [issuerKeyId, exportIssuerPublicKeySpkiDer(publicKey)],
  ]);

  if (register) {
    store.registerIssued({
      issuerKeyId,
      nonce: body.body.nonce,
      transitionCommitment: body.body.transition_commitment,
      enforcementDomain: body.body.enforcement_domain,
      notBefore: body.body.not_before,
      expiresAt: body.body.expires_at,
      warrantBodySha256: body.bodySha256,
    });
  }

  return {
    dir,
    dbPath,
    store,
    tx,
    publicKey,
    privateKey,
    issuerKeyId,
    body,
    signed,
    trusted,
    setNow: (value) => {
      clock = value;
    },
    close: async () => {
      store.close();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

function stageArgs(x, overrides = {}) {
  return {
    warrantBodyBytes: overrides.warrantBodyBytes ?? x.body.bytes,
    warrantSignatureBytes:
      overrides.warrantSignatureBytes ?? x.signed.signatureBytes,
    trustedWarrantIssuers: overrides.trustedWarrantIssuers ?? x.trusted,
    transitionEnvelopeBytes:
      overrides.transitionEnvelopeBytes ?? x.tx.bytes,
    payloadBytes: overrides.payloadBytes ?? payloadBytes,
    payloadChannel:
      overrides.payloadChannel ?? "controlled-requirement-message/v0",
    payloadRecipient: overrides.payloadRecipient ?? recipient,
    payloadContentType: overrides.payloadContentType ?? "requirement",
    authorityStateStore: x.store,
    expectedDomain:
      overrides.expectedDomain ?? CONTROLLED_ENFORCEMENT_DOMAIN,
  };
}

test(
  "E2 stages exact payload bytes and does not deliver or execute",
  { skip: !sqliteAvailable },
  async () => {
    const x = await fixture();
    try {
      const result = stagePayloadThroughE2V0(stageArgs(x));
      assert.equal(result.status, "PAYLOAD_STAGED");
      assert.equal(result.s0State, "PAYLOAD_STAGED");
      assert.equal(result.payloadSha256, payloadSha256);
      assert.equal(result.providerDelivered, false);
      assert.equal(result.e1Executed, false);
      assert.equal(result.evmTransactionSubmitted, false);

      const staged = x.store.getStagedPayload({
        issuerKeyId: x.issuerKeyId,
        nonce: x.body.body.nonce,
      });
      assert.ok(staged.payloadBytes.equals(payloadBytes));
      assert.equal(staged.payloadSha256, payloadSha256);
      assert.equal(staged.payloadRecipient, recipient);
      assert.equal(staged.payloadContentType, "requirement");
    } finally {
      await x.close();
    }
  }
);

test(
  "A3 no Warrant is rejected before staging",
  { skip: !sqliteAvailable },
  async () => {
    const x = await fixture();
    try {
      expectCode(
        () => stagePayloadThroughE2V0(stageArgs(x, { warrantBodyBytes: null })),
        "E2_WARRANT_BODY_REQUIRED"
      );
      assert.equal(x.store.get({ issuerKeyId: x.issuerKeyId, nonce: x.body.body.nonce }).state, "ISSUED");
    } finally {
      await x.close();
    }
  }
);

test(
  "A4 invalid Warrant signature is rejected",
  { skip: !sqliteAvailable },
  async () => {
    const x = await fixture();
    try {
      const invalid = buildWarrantSignatureArtifactV0({
        issuerKeyId: x.issuerKeyId,
        signature: Buffer.alloc(64),
      });
      expectCode(
        () =>
          stagePayloadThroughE2V0(
            stageArgs(x, { warrantSignatureBytes: invalid.bytes })
          ),
        "WARRANT_SIGNATURE_INVALID"
      );
    } finally {
      await x.close();
    }
  }
);

test(
  "A5 untrusted Warrant issuer is rejected",
  { skip: !sqliteAvailable },
  async () => {
    const x = await fixture();
    try {
      expectCode(
        () =>
          stagePayloadThroughE2V0(
            stageArgs(x, { trustedWarrantIssuers: new Map() })
          ),
        "WARRANT_ISSUER_UNTRUSTED"
      );
    } finally {
      await x.close();
    }
  }
);

test(
  "A6 expired Warrant is rejected",
  { skip: !sqliteAvailable },
  async () => {
    const now = 1_800_000_000_000;
    const x = await fixture({ now, expiresAt: now + 1_000 });
    try {
      x.setNow(now + 1_000);
      expectCode(
        () => stagePayloadThroughE2V0(stageArgs(x)),
        "WARRANT_EXPIRED"
      );
      assert.equal(x.store.get({ issuerKeyId: x.issuerKeyId, nonce: x.body.body.nonce }).state, "ISSUED");
    } finally {
      await x.close();
    }
  }
);

test(
  "A7 not-yet-valid Warrant is rejected",
  { skip: !sqliteAvailable },
  async () => {
    const now = 1_800_000_000_000;
    const x = await fixture({ now, notBefore: now + 1_000, expiresAt: now + 10_000 });
    try {
      expectCode(
        () => stagePayloadThroughE2V0(stageArgs(x)),
        "WARRANT_NOT_YET_VALID"
      );
    } finally {
      await x.close();
    }
  }
);

test(
  "A9 changed payload bytes are rejected",
  { skip: !sqliteAvailable },
  async () => {
    const x = await fixture();
    try {
      expectCode(
        () =>
          stagePayloadThroughE2V0(
            stageArgs(x, {
              payloadBytes: Buffer.from('{"company":"Other"}', "utf8"),
            })
          ),
        "E2_PAYLOAD_DIGEST_MISMATCH"
      );
    } finally {
      await x.close();
    }
  }
);

test(
  "A11 wrong enforcement domain is rejected",
  { skip: !sqliteAvailable },
  async () => {
    const x = await fixture({ enforcementDomain: "wrong-domain" });
    try {
      expectCode(
        () => stagePayloadThroughE2V0(stageArgs(x)),
        "WARRANT_DOMAIN_MISMATCH"
      );
    } finally {
      await x.close();
    }
  }
);

test(
  "A12 stale or changed Transition Envelope is rejected",
  { skip: !sqliteAvailable },
  async () => {
    const x = await fixture();
    try {
      const changed = transition({ target: "0x" + "aa".repeat(20) });
      expectCode(
        () =>
          stagePayloadThroughE2V0(
            stageArgs(x, { transitionEnvelopeBytes: changed.bytes })
          ),
        "WARRANT_TRANSITION_COMMITMENT_MISMATCH"
      );
    } finally {
      await x.close();
    }
  }
);

test(
  "A37 payload recipient substitution is rejected",
  { skip: !sqliteAvailable },
  async () => {
    const x = await fixture();
    try {
      expectCode(
        () =>
          stagePayloadThroughE2V0(
            stageArgs(x, { payloadRecipient: "0x" + "ab".repeat(20) })
          ),
        "E2_PAYLOAD_RECIPIENT_MISMATCH"
      );
    } finally {
      await x.close();
    }
  }
);

test(
  "A38 signed but unregistered Warrant is rejected",
  { skip: !sqliteAvailable },
  async () => {
    const x = await fixture({ register: false });
    try {
      expectCode(
        () => stagePayloadThroughE2V0(stageArgs(x)),
        "S0_RECORD_NOT_FOUND"
      );
    } finally {
      await x.close();
    }
  }
);

test(
  "A39 Warrant body differing from S0 registration is rejected",
  { skip: !sqliteAvailable },
  async () => {
    const x = await fixture();
    try {
      const body2 = buildWarrantBodyV0({
        transitionCommitment: x.tx.transitionCommitment,
        notBefore: x.body.body.not_before,
        expiresAt: x.body.body.expires_at + 1_000,
        nonce: x.body.body.nonce,
        issuerKeyId: x.issuerKeyId,
      });
      const signed2 = signWarrantBodyV0({
        bodyBytes: body2.bytes,
        privateKey: x.privateKey,
        publicKey: x.publicKey,
      });

      expectCode(
        () =>
          stagePayloadThroughE2V0(
            stageArgs(x, {
              warrantBodyBytes: body2.bytes,
              warrantSignatureBytes: signed2.signatureBytes,
            })
          ),
        "S0_WARRANT_BODY_DIGEST_MISMATCH"
      );
    } finally {
      await x.close();
    }
  }
);

test(
  "A43 staged payload cannot be replaced or staged twice",
  { skip: !sqliteAvailable },
  async () => {
    const x = await fixture();
    try {
      stagePayloadThroughE2V0(stageArgs(x));
      expectCode(
        () => stagePayloadThroughE2V0(stageArgs(x)),
        "S0_STATE_INVALID"
      );

      const original = x.store.getStagedPayload({
        issuerKeyId: x.issuerKeyId,
        nonce: x.body.body.nonce,
      });
      assert.ok(original.payloadBytes.equals(payloadBytes));

      expectCode(
        () =>
          x.store.stagePayloadExact({
            issuerKeyId: x.issuerKeyId,
            nonce: x.body.body.nonce,
            transitionCommitment: x.tx.transitionCommitment,
            enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
            warrantBodySha256: x.body.bodySha256,
            payloadBytes: Buffer.from("replacement", "utf8"),
            payloadChannel: "controlled-requirement-message/v0",
            payloadRecipient: recipient,
            payloadContentType: "requirement",
          }),
        "S0_STATE_INVALID"
      );

      const after = x.store.getStagedPayload({
        issuerKeyId: x.issuerKeyId,
        nonce: x.body.body.nonce,
      });
      assert.ok(after.payloadBytes.equals(payloadBytes));
    } finally {
      await x.close();
    }
  }
);

test(
  "E2 rejects channel and content-type substitution",
  { skip: !sqliteAvailable },
  async () => {
    const a = await fixture();
    try {
      expectCode(
        () =>
          stagePayloadThroughE2V0(
            stageArgs(a, { payloadChannel: "other-channel" })
          ),
        "E2_PAYLOAD_CHANNEL_MISMATCH"
      );
    } finally {
      await a.close();
    }

    const b = await fixture();
    try {
      expectCode(
        () =>
          stagePayloadThroughE2V0(
            stageArgs(b, { payloadContentType: "other" })
          ),
        "E2_PAYLOAD_CONTENT_TYPE_MISMATCH"
      );
    } finally {
      await b.close();
    }
  }
);

test(
  "E2 staged exact bytes survive S0 restart",
  { skip: !sqliteAvailable },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paygod-e2-restart-"));
    const dbPath = path.join(dir, "authority.db");
    const now = 1_800_000_000_000;
    let store = await openAuthorityStateStoreV0(dbPath, { now: () => now });

    const tx = transition();
    const { publicKey, privateKey } = generateIssuerKeyPairV0();
    const issuerKeyId = issuerKeyIdFromPublicKey(publicKey);
    const body = buildWarrantBodyV0({
      transitionCommitment: tx.transitionCommitment,
      notBefore: now,
      expiresAt: now + 60_000,
      nonce: "cd".repeat(32),
      issuerKeyId,
    });
    const signed = signWarrantBodyV0({
      bodyBytes: body.bytes,
      privateKey,
      publicKey,
    });
    store.registerIssued({
      issuerKeyId,
      nonce: body.body.nonce,
      transitionCommitment: tx.transitionCommitment,
      enforcementDomain: CONTROLLED_ENFORCEMENT_DOMAIN,
      notBefore: body.body.not_before,
      expiresAt: body.body.expires_at,
      warrantBodySha256: body.bodySha256,
    });

    stagePayloadThroughE2V0({
      warrantBodyBytes: body.bytes,
      warrantSignatureBytes: signed.signatureBytes,
      trustedWarrantIssuers: new Map([
        [issuerKeyId, exportIssuerPublicKeySpkiDer(publicKey)],
      ]),
      transitionEnvelopeBytes: tx.bytes,
      payloadBytes,
      payloadChannel: "controlled-requirement-message/v0",
      payloadRecipient: recipient,
      payloadContentType: "requirement",
      authorityStateStore: store,
    });

    store.close();
    store = await openAuthorityStateStoreV0(dbPath, { now: () => now });
    const staged = store.getStagedPayload({
      issuerKeyId,
      nonce: body.body.nonce,
    });
    assert.ok(staged.payloadBytes.equals(payloadBytes));
    assert.equal(staged.payloadSha256, payloadSha256);
    assert.equal(store.get({ issuerKeyId, nonce: body.body.nonce }).state, "PAYLOAD_STAGED");

    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
);

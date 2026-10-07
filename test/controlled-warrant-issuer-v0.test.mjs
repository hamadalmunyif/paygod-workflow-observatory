import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AuthorityError } from "../src/authority-error.mjs";
import { sha256Bytes } from "../src/digest.mjs";
import { buildTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";
import { buildControlledReleaseCandidateV0 } from "../src/controlled-release-candidate-v0.mjs";
import { generateIssuerKeyPairV0 } from "../src/warrant-v0.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { issueControlledWarrantFromTrustedDecisionV0 } from "../src/controlled-warrant-issuer-v0.mjs";

const identity = "11".repeat(32);
const payloadDigest = "22".repeat(32);
const attemptCommitment = "33".repeat(32);
const canonicalHash = "44".repeat(32);
const packDigest = "ea21e54e165c90418a6d4a903108441fa6d7c0e2c425adc14c0f62a430b9dc7b";

function expectCode(fn, code) {
  assert.throws(
    fn,
    (err) => err instanceof AuthorityError && err.code === code
  );
}

function shadow(overrides = {}) {
  return {
    kind: "acp-request-shadow",
    mode: "shadow-only",
    request: {
      status: "CANDIDATE_LOCAL_VALIDATED",
      schemaValidation: "LOCAL_VALIDATED",
      admittedRequestIdentitySha256: identity,
      requestPayloadArtifactSha256: payloadDigest,
      attemptId: "attempt-1",
      attemptCommitmentSha256: attemptCommitment,
      ...(overrides.request ?? {}),
    },
    authority: {
      acpJobCreationAuthorized: false,
      acpFundingAuthorized: false,
      acpSigningAuthorized: false,
      acpExecutionAuthorized: false,
      ...(overrides.authority ?? {}),
    },
  };
}

function envelope(overrides = {}) {
  return buildTransitionEnvelopeV0({
    requestIdentitySha256: overrides.requestIdentitySha256 ?? identity,
    transaction: {
      system: "evm",
      chainId: overrides.chainId ?? 31337,
      executionAccount: "0x" + "55".repeat(20),
      target: overrides.target ?? "0x" + "66".repeat(20),
      calldataSha256: "77".repeat(32),
      nativeValue: "0",
    },
    payload: {
      channel: "controlled-requirement-message/v0",
      recipient: "0x" + "88".repeat(20),
      contentType: "requirement",
      payloadSha256: overrides.payloadSha256 ?? payloadDigest,
    },
  });
}

function profile() {
  return {
    schema: "workflow-observatory/controlled-release-profile/v0",
    paygodKernelCommit: "23ea2cca74ef8b698718c6d0c8dbda447f13bb37",
    standaloneVerifierVersion: "0.4.0",
    pack: {
      path: "packs/controlled-authority-release-v0",
      name: "controlled-authority-release-v0",
      version: "0.1.0",
      digestSha256: packDigest,
      allowedVerdict: "allow",
      allowedRule: "controlled-local-release",
    },
    enforcementDomain: "controlled-harness/t0-v0",
    chainId: 31337,
    paygodReceiptIssuerAuthenticityRequired: true,
    paygodReceiptSignatureProfile: "paygod-ed25519-receipt-v1",
    paygodReceiptTrustProfile: "paygod-ed25519-trust-v1",
    paygodDecisionIssuerKeyScope: "ephemeral-controlled-harness-epoch",
    paygodDecisionReplayPerformed: false,
    externalExecutionAuthorized: false,
  };
}

function inputs(overrides = {}) {
  const requestShadow = overrides.requestShadow ?? shadow();
  const tx = overrides.tx ?? envelope();
  const candidate =
    overrides.candidate ??
    buildControlledReleaseCandidateV0({
      requestShadow,
      transitionEnvelopeBytes: tx.bytes,
    });

  const receiptObject = {
    input: { canonical_hash: canonicalHash },
    pack: {
      name: "controlled-authority-release-v0",
      version: "0.1.0",
      digest_sha256: packDigest,
    },
    verdict: {
      value: "allow",
      rule_name: "controlled-local-release",
    },
    ...(overrides.receiptPatch ?? {}),
  };
  const receiptBytes =
    overrides.receiptBytes ?? Buffer.from(JSON.stringify(receiptObject), "utf8");

  const verification = {
    status: "valid",
    verifier_version: "0.4.0",
    receipt_sha256: sha256Bytes(receiptBytes),
    verification: {
      integrity: "verified",
      issuer_authenticity: "verified",
      replay: "not_performed",
      time_authority: "producer_supplied",
    },
    issuer_signature: {
      present: true,
      profile: "paygod-ed25519-receipt-v1",
      algorithm: "Ed25519",
      key_id: "controlled-decision-ed25519:test",
      receipt_sha256_matches: true,
      key_trusted: true,
      signature_valid: true,
      reason: "verified",
    },
    ...(overrides.verificationPatch ?? {}),
  };

  return {
    candidateBytes: candidate.bytes,
    requestShadow,
    transitionEnvelopeBytes: tx.bytes,
    releaseProfile: overrides.releaseProfile ?? profile(),
    paygodValidate:
      overrides.paygodValidate ?? { status: "success", data: { hash: canonicalHash } },
    receiptBytes,
    paygodVerification: verification,
  };
}

let sqliteAvailable = false;
try {
  await import("node:sqlite");
  sqliteAvailable = true;
} catch {
  sqliteAvailable = false;
}

async function withStore(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paygod-issuer-"));
  const dbPath = path.join(dir, "authority.db");
  const now = 1_800_000_000_000;
  const store = await openAuthorityStateStoreV0(dbPath, { now: () => now });
  try {
    return await fn({ store, now });
  } finally {
    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test(
  "authenticated canonical decision issues Warrant and registers S0 before return",
  { skip: !sqliteAvailable },
  async () => {
    await withStore(({ store, now }) => {
      const { publicKey, privateKey } = generateIssuerKeyPairV0();
      const result = issueControlledWarrantFromTrustedDecisionV0({
        ...inputs(),
        issuerPrivateKey: privateKey,
        issuerPublicKey: publicKey,
        authorityStateStore: store,
        validityMs: 30_000,
        nonceFactory: () => "99".repeat(32),
      });

      assert.equal(result.status, "ISSUED");
      assert.equal(result.state.state, "ISSUED");
      assert.equal(result.warrant.body.transition_commitment, result.decision.transitionCommitment);
      assert.equal(result.warrant.body.not_before, now);
      assert.equal(result.warrant.body.expires_at, now + 30_000);
      assert.equal(result.audit.request_attempt_id, "attempt-1");
      assert.equal(result.audit.request_attempt_commitment_sha256, attemptCommitment);
      assert.equal(result.audit.decision_replay, "not_performed");

      const row = store.get({
        issuerKeyId: result.warrant.body.issuer_key_id,
        nonce: result.warrant.body.nonce,
      });
      assert.equal(row.state, "ISSUED");
      assert.equal(row.warrantBodySha256, result.warrant.bodySha256);
      assert.equal(row.transitionCommitment, result.decision.transitionCommitment);
    });
  }
);

test(
  "A29/A30 deny decision cannot mint a Warrant",
  { skip: !sqliteAvailable },
  async () => {
    await withStore(({ store }) => {
      const { publicKey, privateKey } = generateIssuerKeyPairV0();
      const base = inputs();
      const receipt = JSON.parse(base.receiptBytes.toString("utf8"));
      receipt.verdict.value = "deny";
      receipt.verdict.rule_name = "denied-test";
      const receiptBytes = Buffer.from(JSON.stringify(receipt), "utf8");
      const verification = {
        ...base.paygodVerification,
        receipt_sha256: sha256Bytes(receiptBytes),
      };

      expectCode(
        () =>
          issueControlledWarrantFromTrustedDecisionV0({
            ...base,
            receiptBytes,
            paygodVerification: verification,
            issuerPrivateKey: privateKey,
            issuerPublicKey: publicKey,
            authorityStateStore: store,
          }),
        "DECISION_VERDICT_CONTRACT_MISMATCH"
      );
    });
  }
);

test(
  "A31 request substitution before issuance is rejected",
  { skip: !sqliteAvailable },
  async () => {
    await withStore(({ store }) => {
      const { publicKey, privateKey } = generateIssuerKeyPairV0();
      const base = inputs();
      const substitutedShadow = shadow({
        request: { admittedRequestIdentitySha256: "ab".repeat(32) },
      });

      expectCode(
        () =>
          issueControlledWarrantFromTrustedDecisionV0({
            ...base,
            requestShadow: substitutedShadow,
            issuerPrivateKey: privateKey,
            issuerPublicKey: publicKey,
            authorityStateStore: store,
          }),
        "RELEASE_REQUEST_TRANSITION_IDENTITY_MISMATCH"
      );
    });
  }
);

test(
  "A32 transition substitution before issuance is rejected",
  { skip: !sqliteAvailable },
  async () => {
    await withStore(({ store }) => {
      const { publicKey, privateKey } = generateIssuerKeyPairV0();
      const base = inputs();
      const substitutedTx = envelope({ target: "0x" + "aa".repeat(20) });

      expectCode(
        () =>
          issueControlledWarrantFromTrustedDecisionV0({
            ...base,
            transitionEnvelopeBytes: substitutedTx.bytes,
            issuerPrivateKey: privateKey,
            issuerPublicKey: publicKey,
            authorityStateStore: store,
          }),
        "RELEASE_CANDIDATE_DERIVATION_MISMATCH"
      );
    });
  }
);

test(
  "A33 wrong enforcement domain cannot issue",
  { skip: !sqliteAvailable },
  async () => {
    await withStore(({ store }) => {
      const { publicKey, privateKey } = generateIssuerKeyPairV0();
      const badProfile = profile();
      badProfile.enforcementDomain = "other-domain";

      expectCode(
        () =>
          issueControlledWarrantFromTrustedDecisionV0({
            ...inputs({ releaseProfile: badProfile }),
            issuerPrivateKey: privateKey,
            issuerPublicKey: publicKey,
            authorityStateStore: store,
          }),
        "DECISION_DOMAIN_PROFILE_MISMATCH"
      );
    });
  }
);

test(
  "untrusted D decision cannot issue",
  { skip: !sqliteAvailable },
  async () => {
    await withStore(({ store }) => {
      const { publicKey, privateKey } = generateIssuerKeyPairV0();
      const base = inputs();
      const verification = {
        ...base.paygodVerification,
        issuer_signature: {
          ...base.paygodVerification.issuer_signature,
          key_trusted: false,
        },
      };

      expectCode(
        () =>
          issueControlledWarrantFromTrustedDecisionV0({
            ...base,
            paygodVerification: verification,
            issuerPrivateKey: privateKey,
            issuerPublicKey: publicKey,
            authorityStateStore: store,
          }),
        "DECISION_ISSUER_SIGNATURE_INVALID"
      );
    });
  }
);

test(
  "A35 duplicate nonce issuance returns no second issued Warrant",
  { skip: !sqliteAvailable },
  async () => {
    await withStore(({ store }) => {
      const firstKeys = generateIssuerKeyPairV0();
      const nonce = "cd".repeat(32);

      const first = issueControlledWarrantFromTrustedDecisionV0({
        ...inputs(),
        issuerPrivateKey: firstKeys.privateKey,
        issuerPublicKey: firstKeys.publicKey,
        authorityStateStore: store,
        nonceFactory: () => nonce,
      });
      assert.equal(first.status, "ISSUED");

      expectCode(
        () =>
          issueControlledWarrantFromTrustedDecisionV0({
            ...inputs(),
            issuerPrivateKey: firstKeys.privateKey,
            issuerPublicKey: firstKeys.publicKey,
            authorityStateStore: store,
            nonceFactory: () => nonce,
          }),
        "S0_NONCE_ALREADY_REGISTERED"
      );

      const row = store.get({
        issuerKeyId: first.warrant.body.issuer_key_id,
        nonce,
      });
      assert.equal(row.state, "ISSUED");
      assert.equal(row.warrantBodySha256, first.warrant.bodySha256);
    });
  }
);

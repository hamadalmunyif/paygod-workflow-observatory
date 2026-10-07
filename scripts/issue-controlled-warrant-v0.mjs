#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { issueControlledWarrantV0 } from "../src/controlled-warrant-issuer-v0.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { verifyWarrantV0 } from "../src/warrant-v0.mjs";
import { resolveWarrantIssuerFromExternalTrustV0 } from "../src/warrant-issuer-trust-v0.mjs";

const PAYGOD_VERIFIER =
  "external/paygod-kernel/tools/verify_portable_evidence.py";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

const requestShadowPath = requiredArg("--request-shadow");
const transitionEnvelopePath = requiredArg("--transition-envelope");
const candidatePath = requiredArg("--candidate");
const profilePath = requiredArg("--profile");
const validatePath = requiredArg("--validate");
const paygodBundleDir = requiredArg("--paygod-bundle");
const decisionTrustStorePath = requiredArg("--decision-trust-store");
const warrantIssuerPrivateKeyPath = requiredArg("--warrant-issuer-private-key");
const warrantIssuerTrustStorePath = requiredArg("--warrant-issuer-trust-store");
const dbPath = requiredArg("--state-db");
const outputDir = requiredArg("--output-dir");
const pythonExecutable = argValue("--python") ?? "python3";

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(path.dirname(dbPath), { recursive: true });

const verifierResultPath = path.join(
  outputDir,
  "issuer-paygod-verification.json"
);

const verifier = spawnSync(
  pythonExecutable,
  [
    PAYGOD_VERIFIER,
    paygodBundleDir,
    "--trusted-issuer-keys",
    decisionTrustStorePath,
    "--require-issuer-authenticity",
    "--result",
    verifierResultPath,
  ],
  {
    stdio: "inherit",
    env: process.env,
  }
);

if (verifier.error) {
  throw new Error(
    `PayGod standalone verifier could not be started: ${verifier.error.message}`
  );
}
if (verifier.status !== 0) {
  throw new Error(
    `PayGod standalone verifier rejected the decision bundle (exit ${verifier.status})`
  );
}

const receiptPath = path.join(paygodBundleDir, "receipt.json");

const [
  requestShadow,
  transitionEnvelopeBytes,
  candidateBytes,
  releaseProfile,
  paygodValidate,
  receiptBytes,
  paygodVerification,
  warrantIssuerPrivateKeyPem,
  warrantIssuerTrustStoreBytes,
] = await Promise.all([
  readJson(requestShadowPath),
  fs.readFile(transitionEnvelopePath),
  fs.readFile(candidatePath),
  readJson(profilePath),
  readJson(validatePath),
  fs.readFile(receiptPath),
  readJson(verifierResultPath),
  fs.readFile(warrantIssuerPrivateKeyPath, "utf8"),
  fs.readFile(warrantIssuerTrustStorePath),
]);

let warrantIssuerTrustStore;
try {
  warrantIssuerTrustStore = JSON.parse(
    warrantIssuerTrustStoreBytes.toString("utf8")
  );
} catch {
  throw new Error("Warrant issuer trust store is not valid JSON");
}

const issuerIdentity = resolveWarrantIssuerFromExternalTrustV0({
  privateKeyPem: warrantIssuerPrivateKeyPem,
  trustStore: warrantIssuerTrustStore,
  trustStoreBytes: warrantIssuerTrustStoreBytes,
});

const store = await openAuthorityStateStoreV0(dbPath);
try {
  const issued = issueControlledWarrantV0({
    candidateBytes,
    requestShadow,
    transitionEnvelopeBytes,
    releaseProfile,
    paygodValidate,
    receiptBytes,
    paygodVerification,
    issuerPrivateKey: issuerIdentity.privateKey,
    issuerPublicKey: issuerIdentity.publicKey,
    authorityStateStore: store,
    validityMs: 60_000,
  });

  if (issued.warrant.body.issuer_key_id !== issuerIdentity.issuerKeyId) {
    throw new Error("issued Warrant key id differs from external issuer trust anchor");
  }

  const trustedIssuers = new Map([
    [issuerIdentity.issuerKeyId, issuerIdentity.publicKeySpkiDer],
  ]);
  const verified = verifyWarrantV0({
    bodyBytes: issued.warrant.bodyBytes,
    signatureBytes: issued.warrant.signatureBytes,
    trustedIssuers,
    expectedDomain: issuerIdentity.enforcementDomain,
    expectedTransitionCommitment: issued.warrant.body.transition_commitment,
    nowMs: issued.audit.issued_at,
  });

  if (verified.status !== "VALID") {
    throw new Error("freshly issued Warrant did not verify");
  }

  await Promise.all([
    fs.writeFile(
      path.join(outputDir, "warrant-body.json"),
      issued.warrant.bodyBytes
    ),
    fs.writeFile(
      path.join(outputDir, "warrant.sig"),
      issued.warrant.signatureBytes
    ),
    fs.writeFile(
      path.join(outputDir, "warrant-issuance-audit.json"),
      JSON.stringify(issued.audit, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "s0-issued.json"),
      JSON.stringify(issued.state, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "warrant-verification.json"),
      JSON.stringify(verified, null, 2) + "\n",
      "utf8"
    ),
  ]);

  const summary = {
    status: issued.status,
    decisionStatus: issued.decision.status,
    decisionIssuerKeyId: issued.decision.decisionIssuerKeyId,
    decisionReplay: issued.decision.decisionReplay,
    requestIdentitySha256: issued.decision.requestIdentitySha256,
    attemptId: issued.decision.attemptId,
    attemptCommitmentSha256: issued.decision.attemptCommitmentSha256,
    transitionCommitment: issued.decision.transitionCommitment,
    warrantIssuerKeyId: issued.warrant.body.issuer_key_id,
    warrantIssuerTrustStoreSha256: issuerIdentity.trustStoreSha256,
    warrantBodySha256: issued.warrant.bodySha256,
    warrantNonce: issued.warrant.body.nonce,
    s0State: issued.state.state,
    warrantVerification: verified.status,
    issuerBridgeVerifier: PAYGOD_VERIFIER,
    issuerBridgeRequiredAuthenticity: true,
    warrantIssuerTrustExternallyConfigured: true,
    e1Executed: false,
    e2Executed: false,
    evmTransactionSubmitted: false,
    acpOrQuiverInteraction: false,
  };

  await fs.writeFile(
    path.join(outputDir, "issuance-summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
    "utf8"
  );

  console.log(JSON.stringify(summary, null, 2));
} finally {
  store.close();
}

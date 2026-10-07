#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { issueControlledWarrantFromTrustedDecisionV0 } from "../src/controlled-warrant-issuer-v0.mjs";
import {
  exportIssuerPublicKeySpkiDer,
  generateIssuerKeyPairV0,
} from "../src/warrant-v0.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

const candidatePath = requiredArg("--candidate");
const requestShadowPath = requiredArg("--request-shadow");
const transitionPath = requiredArg("--transition-envelope");
const releaseProfilePath = requiredArg("--release-profile");
const paygodValidatePath = requiredArg("--paygod-validate");
const paygodBundleDir = requiredArg("--paygod-bundle");
const decisionTrustStorePath = requiredArg("--decision-trust-store");
const paygodVerifierPath = requiredArg("--paygod-verifier");
const stateDbPath = requiredArg("--state-db");
const outputDir = requiredArg("--output-dir");
const pythonExecutable = argValue("--python") ?? "python3";
const validityMs = Number(argValue("--validity-ms") ?? "60000");

if (!Number.isSafeInteger(validityMs) || validityMs <= 0) {
  throw new Error("--validity-ms must be a positive safe integer");
}

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(path.dirname(stateDbPath), { recursive: true });

const verifierResultPath = path.join(
  outputDir,
  "issuer-paygod-verification.json"
);

const verifierArgs = [
  paygodVerifierPath,
  paygodBundleDir,
  "--trusted-issuer-keys",
  decisionTrustStorePath,
  "--require-issuer-authenticity",
  "--result",
  verifierResultPath,
];

const verifier = spawnSync(pythonExecutable, verifierArgs, {
  stdio: "inherit",
  env: process.env,
});

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
  candidateBytes,
  requestShadow,
  transitionEnvelopeBytes,
  releaseProfile,
  paygodValidate,
  receiptBytes,
  paygodVerification,
] = await Promise.all([
  fs.readFile(candidatePath),
  readJson(requestShadowPath),
  fs.readFile(transitionPath),
  readJson(releaseProfilePath),
  readJson(paygodValidatePath),
  fs.readFile(receiptPath),
  readJson(verifierResultPath),
]);

const { publicKey, privateKey } = generateIssuerKeyPairV0();
const store = await openAuthorityStateStoreV0(stateDbPath);

try {
  const result = issueControlledWarrantFromTrustedDecisionV0({
    candidateBytes,
    requestShadow,
    transitionEnvelopeBytes,
    releaseProfile,
    paygodValidate,
    receiptBytes,
    paygodVerification,
    issuerPrivateKey: privateKey,
    issuerPublicKey: publicKey,
    authorityStateStore: store,
    validityMs,
  });

  const trust = {
    schema: "workflow-observatory/warrant-issuer-trust/v0",
    enforcement_domain: result.warrant.body.enforcement_domain,
    algorithm: "Ed25519",
    issuer_key_id: result.warrant.body.issuer_key_id,
    public_key_spki_der_base64:
      exportIssuerPublicKeySpkiDer(publicKey).toString("base64"),
  };

  const state = store.get({
    issuerKeyId: result.warrant.body.issuer_key_id,
    nonce: result.warrant.body.nonce,
  });

  const summary = {
    status: "LOCAL_WARRANT_ISSUED",
    decision_status: result.decision.status,
    decision_replay: result.decision.decisionReplay,
    decision_issuer_key_id: result.decision.decisionIssuerKeyId,
    transition_commitment: result.decision.transitionCommitment,
    request_identity_sha256: result.decision.requestIdentitySha256,
    request_attempt_id: result.decision.attemptId,
    warrant_issuer_key_id: result.warrant.body.issuer_key_id,
    warrant_body_sha256: result.warrant.bodySha256,
    nonce: result.warrant.body.nonce,
    s0_state: state?.state ?? null,
    external_execution_performed: false,
    e1_performed: false,
    e2_performed: false,
  };

  await Promise.all([
    fs.writeFile(
      path.join(outputDir, "warrant-body.json"),
      result.warrant.bodyBytes
    ),
    fs.writeFile(
      path.join(outputDir, "warrant.sig"),
      result.warrant.signatureBytes
    ),
    fs.writeFile(
      path.join(outputDir, "warrant-issuer-trust.json"),
      JSON.stringify(trust, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "issuance-audit.json"),
      JSON.stringify(result.audit, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "s0-issued-state.json"),
      JSON.stringify(state, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      path.join(outputDir, "issuance-summary.json"),
      JSON.stringify(summary, null, 2) + "\n",
      "utf8"
    ),
  ]);

  console.log(JSON.stringify(summary, null, 2));
} finally {
  store.close();
}

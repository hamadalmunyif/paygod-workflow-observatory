#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

import { issueControlledWarrantV0 } from "../src/controlled-warrant-issuer-v0.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import {
  exportIssuerPublicKeySpkiDer,
  generateIssuerKeyPairV0,
  verifyWarrantV0,
} from "../src/warrant-v0.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const requestShadowPath = argValue("--request-shadow");
const transitionEnvelopePath = argValue("--transition-envelope");
const candidatePath = argValue("--candidate");
const profilePath = argValue("--profile");
const validatePath = argValue("--validate");
const receiptPath = argValue("--receipt");
const verificationPath = argValue("--verification");
const dbPath = argValue("--state-db");
const outputDir = argValue("--output-dir");

if (
  !requestShadowPath ||
  !transitionEnvelopePath ||
  !candidatePath ||
  !profilePath ||
  !validatePath ||
  !receiptPath ||
  !verificationPath ||
  !dbPath ||
  !outputDir
) {
  throw new Error(
    "Usage: issue-controlled-warrant-v0 --request-shadow <json> --transition-envelope <json> --candidate <json> --profile <json> --validate <json> --receipt <json> --verification <json> --state-db <sqlite> --output-dir <dir>"
  );
}

const [
  requestShadow,
  transitionEnvelopeBytes,
  candidateBytes,
  releaseProfile,
  paygodValidate,
  receiptBytes,
  paygodVerification,
] = await Promise.all([
  fs.readFile(requestShadowPath, "utf8").then(JSON.parse),
  fs.readFile(transitionEnvelopePath),
  fs.readFile(candidatePath),
  fs.readFile(profilePath, "utf8").then(JSON.parse),
  fs.readFile(validatePath, "utf8").then(JSON.parse),
  fs.readFile(receiptPath),
  fs.readFile(verificationPath, "utf8").then(JSON.parse),
]);

await fs.mkdir(outputDir, { recursive: true });

const store = await openAuthorityStateStoreV0(dbPath);
try {
  const { publicKey, privateKey } = generateIssuerKeyPairV0();

  const issued = issueControlledWarrantV0({
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
    validityMs: 60_000,
  });

  const publicDer = exportIssuerPublicKeySpkiDer(publicKey);
  const trustedIssuers = new Map([
    [issued.warrant.body.issuer_key_id, publicDer],
  ]);
  const verified = verifyWarrantV0({
    bodyBytes: issued.warrant.bodyBytes,
    signatureBytes: issued.warrant.signatureBytes,
    trustedIssuers,
    expectedDomain: issued.warrant.body.enforcement_domain,
    expectedTransitionCommitment: issued.warrant.body.transition_commitment,
    nowMs: issued.audit.issued_at,
  });

  if (verified.status !== "VALID") {
    throw new Error("freshly issued Warrant did not verify");
  }

  await Promise.all([
    fs.writeFile(
      outputDir + "/warrant-body.json",
      issued.warrant.bodyBytes
    ),
    fs.writeFile(
      outputDir + "/warrant.sig",
      issued.warrant.signatureBytes
    ),
    fs.writeFile(
      outputDir + "/warrant-issuance-audit.json",
      JSON.stringify(issued.audit, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      outputDir + "/s0-issued.json",
      JSON.stringify(issued.state, null, 2) + "\n",
      "utf8"
    ),
    fs.writeFile(
      outputDir + "/warrant-trust.json",
      JSON.stringify(
        {
          profile: "controlled-harness/warrant-trust/v0",
          issuer_key_id: issued.warrant.body.issuer_key_id,
          algorithm: "Ed25519",
          public_key_spki_der_base64: publicDer.toString("base64"),
        },
        null,
        2
      ) + "\n",
      "utf8"
    ),
    fs.writeFile(
      outputDir + "/warrant-verification.json",
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
    warrantBodySha256: issued.warrant.bodySha256,
    warrantNonce: issued.warrant.body.nonce,
    s0State: issued.state.state,
    warrantVerification: verified.status,
    e1Executed: false,
    e2Executed: false,
    evmTransactionSubmitted: false,
    acpOrQuiverInteraction: false,
  };

  await fs.writeFile(
    outputDir + "/issuance-summary.json",
    JSON.stringify(summary, null, 2) + "\n",
    "utf8"
  );

  console.log(JSON.stringify(summary, null, 2));
} finally {
  store.close();
}

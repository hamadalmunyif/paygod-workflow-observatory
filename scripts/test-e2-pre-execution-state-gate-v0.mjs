#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

import { AuthorityError } from "../src/authority-error.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { parseExactTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";
import { verifyWarrantV0 } from "../src/warrant-v0.mjs";
import { trustedWarrantIssuersFromExternalTrustV0 } from "../src/warrant-issuer-trust-v0.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error("Missing required argument: " + name);
  return value;
}

const [
  warrantBodyBytes,
  warrantSignatureBytes,
  trustBytes,
  transitionEnvelopeBytes,
] = await Promise.all([
  fs.readFile(requiredArg("--warrant-body")),
  fs.readFile(requiredArg("--warrant-signature")),
  fs.readFile(requiredArg("--warrant-trust-store")),
  fs.readFile(requiredArg("--transition-envelope")),
]);

const trust = trustedWarrantIssuersFromExternalTrustV0({
  trustStore: JSON.parse(trustBytes.toString("utf8")),
  trustStoreBytes: trustBytes,
});
const transition = parseExactTransitionEnvelopeV0(transitionEnvelopeBytes);

const store = await openAuthorityStateStoreV0(requiredArg("--state-db"));
try {
  const warrant = verifyWarrantV0({
    bodyBytes: warrantBodyBytes,
    signatureBytes: warrantSignatureBytes,
    trustedIssuers: trust.trustedIssuers,
    expectedDomain: trust.enforcementDomain,
    expectedTransitionCommitment: transition.transitionCommitment,
    nowMs: store.currentTimeMs(),
  });

  const key = { issuerKeyId: warrant.issuerKeyId, nonce: warrant.nonce };
  const rowBefore = store.get(key);
  const staged = store.getStagedPayload(key);
  if (rowBefore?.state !== "PAYLOAD_STAGED" || !staged) {
    throw new Error("A20/A41 precondition requires PAYLOAD_STAGED with staged bytes");
  }

  let observedCode = null;
  try {
    store.releasePayload({
      issuerKeyId: warrant.issuerKeyId,
      nonce: warrant.nonce,
      transitionCommitment: transition.transitionCommitment,
      enforcementDomain: warrant.enforcementDomain,
      payloadSha256: staged.payloadSha256,
    });
  } catch (err) {
    if (err instanceof AuthorityError && err.code === "S0_STATE_INVALID") {
      observedCode = err.code;
    } else {
      throw err;
    }
  }

  if (observedCode !== "S0_STATE_INVALID") {
    throw new Error("A20/A41 failed: release state gate accepted before TX_EXECUTED");
  }

  const rowAfter = store.get(key);
  if (rowAfter?.state !== "PAYLOAD_STAGED") {
    throw new Error("A20/A41 rejection changed authority state");
  }

  console.log(JSON.stringify({
    schema: "workflow-observatory/e2-pre-execution-release-attack/v0",
    attack_ids: ["A20", "A41"],
    status: "REJECTED_AS_EXPECTED",
    observed_code: observedCode,
    s0_state_before: rowBefore.state,
    s0_state_after: rowAfter.state,
    staged_payload_sha256: staged.payloadSha256,
    provider_delivery_attempted: false,
  }, null, 2));
} finally {
  store.close();
}

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { normalizeBrowse } from "../src/normalize-browse.mjs";
import { buildShadowRequest } from "../src/build-shadow-request.mjs";

async function descriptorSet() {
  const payload = JSON.parse(
    await fs.readFile(new URL("./fixtures/browse.json", import.meta.url), "utf8")
  );
  return normalizeBrowse(payload, { query: "risk" });
}

const manifest = {
  source: { sha256: "a".repeat(64) },
  normalized: { canonicalSha256: "b".repeat(64) },
};

test("missing offering is withheld and never authorizes ACP execution", async () => {
  const result = buildShadowRequest({
    descriptorSet: await descriptorSet(),
    observationManifest: manifest,
    offeringName: "does-not-exist",
  });

  assert.equal(result.workflow.descriptorPresent, false);
  assert.equal(result.request.status, "WITHHELD_NO_DESCRIPTOR");
  assert.equal(result.authority.acpExecutionAuthorized, false);
  assert.equal(result.authority.acpSigningAuthorized, false);
});

test("observed offering without payload becomes withheld request candidate", async () => {
  const result = buildShadowRequest({
    descriptorSet: await descriptorSet(),
    observationManifest: manifest,
    offeringName: "Company Risk Analysis",
  });

  assert.equal(result.workflow.descriptorPresent, true);
  assert.equal(result.request.payloadPresent, false);
  assert.equal(result.request.status, "WITHHELD_NO_PAYLOAD");
  assert.equal(result.request.schemaValidation, "NOT_RUN");
});

test("supplied payload stays unvalidated rather than being silently admitted", async () => {
  const result = buildShadowRequest({
    descriptorSet: await descriptorSet(),
    observationManifest: manifest,
    offeringName: "Company Risk Analysis",
    requestPayload: { company: "ABC" },
  });

  assert.equal(result.request.payloadPresent, true);
  assert.equal(result.request.status, "CANDIDATE_UNVALIDATED");
  assert.equal(result.request.schemaValidation, "NOT_RUN");
  assert.equal(result.trust.requestSchemaCorrectness, "NOT_VALIDATED");
  assert.equal(result.authority.acpJobCreationAuthorized, false);
});

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


test("PayGod shadow envelope excludes raw descriptor floats and binds them by digest", async () => {
  const payload = {
    data: [
      {
        id: "agent-float",
        name: "Quiver-like",
        walletAddress: "0xabc",
        chains: [{ chainId: 8453 }],
        offerings: [
          {
            id: "off-float",
            name: "getCongressTrades",
            description: "example",
            requirements: {
              type: "object",
              properties: {
                limit: { type: "integer", minimum: 1 }
              }
            },
            deliverable: { type: "object" },
            slaMinutes: 5,
            priceType: "FIXED",
            priceValue: 0.01,
            requiredFunds: false
          }
        ],
        resources: []
      }
    ]
  };

  const result = buildShadowRequest({
    descriptorSet: normalizeBrowse(payload, { query: "congress" }),
    observationManifest: manifest,
    offeringName: "getCongressTrades",
  });

  const serialized = JSON.stringify(result);
  assert.equal(result.workflow.descriptorPresent, true);
  assert.equal("selectedDescriptor" in result.workflow, false);
  assert.equal(result.workflow.selectedDescriptorRef.capabilityName, "getCongressTrades");
  assert.match(result.workflow.selectedDescriptorRef.descriptorCanonicalSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.evidenceAdmission.rawDescriptorAdmittedToPayGod, false);
  assert.equal(serialized.includes('"priceValue":0.01'), false);
});

test("raw request payload is not embedded in PayGod shadow input", async () => {
  const result = buildShadowRequest({
    descriptorSet: await descriptorSet(),
    observationManifest: manifest,
    offeringName: "Company Risk Analysis",
    requestPayload: { confidence: 0.125, company: "ABC" },
  });

  assert.equal("payload" in result.request, false);
  assert.match(result.request.requestPayloadCanonicalSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.evidenceAdmission.rawRequestPayloadAdmittedToPayGod, false);
  assert.equal(JSON.stringify(result).includes("0.125"), false);
});

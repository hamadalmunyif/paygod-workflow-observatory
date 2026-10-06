import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { normalizeBrowse } from "../src/normalize-browse.mjs";
import { buildShadowRequest } from "../src/build-shadow-request.mjs";
import { buildRequestIdentityCommitment } from "../src/request-identity.mjs";

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

const packVerification = {
  status: "VERIFIED",
  derivation: "VERIFIED",
  manifestCanonicalSha256: "c".repeat(64),
  externalAnchorStatus: "UNANCHORED",
  observationAuthenticity: "NOT_PROVEN",
};

function selectedOffering(set, name) {
  return set.descriptors.find(
    (item) => item.descriptorType === "offering" && item.capability?.name === name
  );
}

function frozenIdentity(set, name, payload) {
  return buildRequestIdentityCommitment({
    selectedDescriptor: selectedOffering(set, name),
    requestPayload: payload,
  });
}

test("projection refuses unverified observation packs", async () => {
  assert.throws(
    () =>
      buildShadowRequest({
        descriptorSet: await descriptorSet(),
        observationManifest: manifest,
        packVerification: null,
        offeringName: "Company Risk Analysis",
      }),
    (err) => err.code === "PACK_NOT_VERIFIED"
  );
});

test("missing offering is withheld with stable reason code", async () => {
  const result = buildShadowRequest({
    descriptorSet: await descriptorSet(),
    observationManifest: manifest,
    packVerification,
    offeringName: "does-not-exist",
  });

  assert.equal(result.workflow.descriptorPresent, false);
  assert.equal(result.request.status, "WITHHELD_NO_DESCRIPTOR");
  assert.equal(result.request.decisionReasonCode, "ADMISSION_DESCRIPTOR_NOT_FOUND");
  assert.equal(result.authority.acpExecutionAuthorized, false);
});

test("observed offering without payload is flagged with stable reason code", async () => {
  const result = buildShadowRequest({
    descriptorSet: await descriptorSet(),
    observationManifest: manifest,
    packVerification,
    offeringName: "Company Risk Analysis",
  });

  assert.equal(result.workflow.descriptorPresent, true);
  assert.equal(result.request.payloadPresent, false);
  assert.equal(result.request.status, "WITHHELD_NO_PAYLOAD");
  assert.equal(result.request.decisionReasonCode, "ADMISSION_PAYLOAD_MISSING");
  assert.equal(result.request.schemaValidation, "NOT_RUN");
});

test("supplied payload is locally validated against a frozen request identity", async () => {
  const set = await descriptorSet();
  const payload = { company: "ABC" };
  const identity = frozenIdentity(set, "Company Risk Analysis", payload);

  const result = buildShadowRequest({
    descriptorSet: set,
    observationManifest: manifest,
    packVerification,
    offeringName: "Company Risk Analysis",
    requestPayload: payload,
    submittedRequestIdentity: identity,
  });

  assert.equal(result.request.status, "CANDIDATE_LOCAL_VALIDATED");
  assert.equal(result.request.schemaValidation, "LOCAL_VALIDATED");
  assert.equal(result.request.validationErrorCount, 0);
  assert.equal(result.request.decisionReasonCode, "ADMISSION_LOCAL_VALIDATED");
  assert.equal(
    result.request.submittedRequestIdentitySha256,
    result.request.admittedRequestIdentitySha256
  );
  assert.equal(result.authority.acpJobCreationAuthorized, false);
});

test("payload mutation after identity freeze fails closed", async () => {
  const set = await descriptorSet();
  const identity = frozenIdentity(set, "Company Risk Analysis", { company: "ABC" });

  assert.throws(
    () =>
      buildShadowRequest({
        descriptorSet: set,
        observationManifest: manifest,
        packVerification,
        offeringName: "Company Risk Analysis",
        requestPayload: { company: "XYZ" },
        submittedRequestIdentity: identity,
      }),
    (err) => err.code === "REQUEST_IDENTITY_MISMATCH"
  );
});

test("PayGod shadow envelope excludes raw descriptor floats and binds them by digest", () => {
  const payload = {
    data: [{
      id: "agent-float",
      name: "Quiver-like",
      walletAddress: "0xabc",
      chains: [{ chainId: 8453 }],
      offerings: [{
        id: "off-float",
        name: "getCongressTrades",
        description: "example",
        requirements: {
          type: "object",
          properties: { limit: { type: "integer", minimum: 1 } }
        },
        deliverable: { type: "object" },
        slaMinutes: 5,
        priceType: "FIXED",
        priceValue: 0.01,
        requiredFunds: false
      }],
      resources: []
    }]
  };
  const set = normalizeBrowse(payload, { query: "congress" });

  const result = buildShadowRequest({
    descriptorSet: set,
    observationManifest: manifest,
    packVerification,
    offeringName: "getCongressTrades",
  });

  const serialized = JSON.stringify(result);
  assert.equal(result.workflow.descriptorPresent, true);
  assert.equal("selectedDescriptor" in result.workflow, false);
  assert.equal(
    result.workflow.selectedDescriptorRef.capabilityName,
    "getCongressTrades"
  );
  assert.match(
    result.workflow.selectedDescriptorRef.descriptorCanonicalSha256,
    /^[a-f0-9]{64}$/
  );
  assert.equal(result.evidenceAdmission.rawDescriptorAdmittedToPayGod, false);
  assert.equal(serialized.includes('"priceValue":0.01'), false);
});

test("raw request payload is not embedded in PayGod shadow input", async () => {
  const set = await descriptorSet();
  const payload = { confidence: 0.125, company: "ABC" };
  const identity = frozenIdentity(set, "Company Risk Analysis", payload);

  const result = buildShadowRequest({
    descriptorSet: set,
    observationManifest: manifest,
    packVerification,
    offeringName: "Company Risk Analysis",
    requestPayload: payload,
    submittedRequestIdentity: identity,
  });

  assert.equal("payload" in result.request, false);
  assert.match(result.request.requestPayloadCanonicalSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.evidenceAdmission.rawRequestPayloadAdmittedToPayGod, false);
  assert.equal(JSON.stringify(result).includes("0.125"), false);
});

function congressionalSet() {
  return normalizeBrowse({
    data: [{
      id: "quiver-agent",
      name: "Quiver",
      walletAddress: "0xabc",
      chains: [{ chainId: 8453 }],
      offerings: [{
        id: "congress-offering",
        name: "getCongressTrades",
        requirements: {
          type: "object",
          properties: {
            limit: { type: "number", default: 100, maximum: 1000 },
            ticker: { type: "string" }
          }
        },
        deliverable: { type: "object" },
        slaMinutes: 5,
        priceType: "fixed",
        priceValue: 0.01,
        requiredFunds: false
      }],
      resources: []
    }]
  }, { query: "congress" });
}

test("live-shaped congressional request limit 5 is locally valid", () => {
  const set = congressionalSet();
  const payload = { limit: 5 };
  const identity = frozenIdentity(set, "getCongressTrades", payload);

  const result = buildShadowRequest({
    descriptorSet: set,
    observationManifest: manifest,
    packVerification,
    offeringName: "getCongressTrades",
    requestPayload: payload,
    submittedRequestIdentity: identity,
  });

  assert.equal(result.request.status, "CANDIDATE_LOCAL_VALIDATED");
  assert.equal(result.request.schemaValidation, "LOCAL_VALIDATED");
  assert.equal(result.request.decisionReasonCode, "ADMISSION_LOCAL_VALIDATED");
  assert.equal(result.authority.acpExecutionAuthorized, false);
  assert.equal(JSON.stringify(result).includes('"limit":5'), false);
});

test("congressional request above observed maximum is withheld with exact code", () => {
  const set = congressionalSet();
  const payload = { limit: 1001 };
  const identity = frozenIdentity(set, "getCongressTrades", payload);

  const result = buildShadowRequest({
    descriptorSet: set,
    observationManifest: manifest,
    packVerification,
    offeringName: "getCongressTrades",
    requestPayload: payload,
    submittedRequestIdentity: identity,
  });

  assert.equal(result.request.status, "WITHHELD_SCHEMA_INVALID");
  assert.equal(result.request.schemaValidation, "LOCAL_REJECTED");
  assert.equal(result.request.validationErrorCount, 1);
  assert.equal(result.request.decisionReasonCode, "SCHEMA_MAXIMUM");
});

test("congressional request wrong type is withheld with exact code", () => {
  const set = congressionalSet();
  const payload = { limit: "5" };
  const identity = frozenIdentity(set, "getCongressTrades", payload);

  const result = buildShadowRequest({
    descriptorSet: set,
    observationManifest: manifest,
    packVerification,
    offeringName: "getCongressTrades",
    requestPayload: payload,
    submittedRequestIdentity: identity,
  });

  assert.equal(result.request.status, "WITHHELD_SCHEMA_INVALID");
  assert.equal(result.request.decisionReasonCode, "SCHEMA_TYPE_MISMATCH");
});

test("extra properties follow the observed schema rather than invented policy", () => {
  const set = congressionalSet();
  const payload = { limit: 5, extra: "allowed-because-schema-does-not-forbid-it" };
  const identity = frozenIdentity(set, "getCongressTrades", payload);

  const result = buildShadowRequest({
    descriptorSet: set,
    observationManifest: manifest,
    packVerification,
    offeringName: "getCongressTrades",
    requestPayload: payload,
    submittedRequestIdentity: identity,
  });

  assert.equal(result.request.schemaValidation, "LOCAL_VALIDATED");
  assert.equal(result.request.decisionReasonCode, "ADMISSION_LOCAL_VALIDATED");
});

test("request identity v0 contains no nonce", () => {
  const set = congressionalSet();
  const identity = frozenIdentity(set, "getCongressTrades", { limit: 5 });
  assert.equal(identity.correlationNonce, null);
  assert.equal(
    identity.commitment.schema,
    "workflow-observatory/request-identity/v0"
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(identity.commitment, "nonce"),
    false
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { normalizeBrowse } from "../src/normalize-browse.mjs";
import { buildObservationManifest } from "../src/observation-pack.mjs";
import {
  ObservationPackVerificationError,
  verifyObservationPack,
} from "../src/observation-pack-verify.mjs";
import { sha256CanonicalJson } from "../src/digest.mjs";

async function rawFixture() {
  return fs.readFile(new URL("./fixtures/browse.json", import.meta.url));
}

async function baselinePack() {
  const rawBytes = await rawFixture();
  const payload = JSON.parse(rawBytes.toString("utf8"));
  const normalized = normalizeBrowse(payload, { query: "risk" });
  const manifest = buildObservationManifest({
    mode: "discover",
    rawBytes,
    normalized,
  });
  return { rawBytes, normalized, manifest };
}

function expectCode(fn, code) {
  assert.throws(
    fn,
    (err) =>
      err instanceof ObservationPackVerificationError &&
      err.code === code
  );
}

test("baseline observation pack verifies but remains externally unanchored", async () => {
  const pack = await baselinePack();
  const result = verifyObservationPack(pack);
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.derivation, "VERIFIED");
  assert.equal(result.externalAnchorStatus, "UNANCHORED");
  assert.equal(result.observationAuthenticity, "NOT_PROVEN");
});

test("normalized mutation with stale manifest fails with exact digest code", async () => {
  const pack = await baselinePack();
  const mutated = structuredClone(pack.normalized);
  mutated.descriptors[0].capability.name = "tampered";
  expectCode(
    () =>
      verifyObservationPack({
        ...pack,
        normalized: mutated,
      }),
    "PACK_NORMALIZED_DIGEST_MISMATCH"
  );
});

test("normalized plus recomputed manifest cannot hide divergence from unchanged raw", async () => {
  const pack = await baselinePack();
  const mutated = structuredClone(pack.normalized);
  mutated.descriptors[0].capability.name = "tampered";
  const recomputedManifest = buildObservationManifest({
    mode: "discover",
    rawBytes: pack.rawBytes,
    normalized: mutated,
  });

  expectCode(
    () =>
      verifyObservationPack({
        rawBytes: pack.rawBytes,
        normalized: mutated,
        manifest: recomputedManifest,
      }),
    "PACK_DERIVATION_MISMATCH"
  );
});

test("coherent rewrite of raw normalized and manifest passes internal checks but stays unanchored", async () => {
  const pack = await baselinePack();
  const rawPayload = JSON.parse(pack.rawBytes.toString("utf8"));
  rawPayload.data[0].name = "coherently-rewritten-agent";
  const rawBytes = Buffer.from(JSON.stringify(rawPayload));
  const normalized = normalizeBrowse(rawPayload, { query: "risk" });
  const manifest = buildObservationManifest({
    mode: "discover",
    rawBytes,
    normalized,
  });

  const result = verifyObservationPack({ rawBytes, normalized, manifest });
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.externalAnchorStatus, "UNANCHORED");
  assert.notEqual(
    result.manifestCanonicalSha256,
    sha256CanonicalJson(pack.manifest)
  );
});

test("external manifest anchor detects coherent whole-pack rewrite", async () => {
  const pack = await baselinePack();
  const expectedAnchor = sha256CanonicalJson(pack.manifest);

  const rawPayload = JSON.parse(pack.rawBytes.toString("utf8"));
  rawPayload.data[0].name = "coherently-rewritten-agent";
  const rawBytes = Buffer.from(JSON.stringify(rawPayload));
  const normalized = normalizeBrowse(rawPayload, { query: "risk" });
  const manifest = buildObservationManifest({
    mode: "discover",
    rawBytes,
    normalized,
  });

  expectCode(
    () =>
      verifyObservationPack({
        rawBytes,
        normalized,
        manifest,
        expectedManifestCanonicalSha256: expectedAnchor,
      }),
    "PACK_EXTERNAL_ANCHOR_MISMATCH"
  );
});

test("matching external manifest anchor upgrades only anchor status, not authenticity", async () => {
  const pack = await baselinePack();
  const expectedAnchor = sha256CanonicalJson(pack.manifest);
  const result = verifyObservationPack({
    ...pack,
    expectedManifestCanonicalSha256: expectedAnchor,
  });
  assert.equal(result.externalAnchorStatus, "MATCHED");
  assert.equal(result.observationAuthenticity, "NOT_PROVEN");
});

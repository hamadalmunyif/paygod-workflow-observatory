import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { normalizeBrowse } from "../src/normalize-browse.mjs";
import { normalizeHistory } from "../src/normalize-history.mjs";

async function fixture(name) {
  return JSON.parse(await fs.readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

test("browse creates descriptors without inventing execution output", async () => {
  const out = normalizeBrowse(await fixture("browse.json"), { query: "risk" });
  assert.equal(out.kind, "workflow-descriptor-set");
  assert.equal(out.descriptorCount, 2);
  const offering = out.descriptors.find((x) => x.descriptorType === "offering");
  const resource = out.descriptors.find((x) => x.descriptorType === "resource");
  assert.equal(offering.requestContract.provenance.classification, "RAW_REMOTE");
  assert.equal(resource.expectedOutput.provenance.classification, "UNKNOWN");
});

test("history preserves raw requirement and marks parsed JSON local-derived", async () => {
  const input = await fixture("history.json");
  const out = normalizeHistory(input);
  assert.equal(out.context.state, "submitted");
  assert.equal(out.context.stateProvenance.classification, "LOCAL_DERIVED");
  assert.deepEqual(out.request.inputs, { company: "ABC" });
  assert.equal(out.request.inputsProvenance.classification, "LOCAL_DERIVED");
  assert.equal(out.request.rawEntry, input.entries[1]);
  assert.equal(out.request.rawEntryProvenance.classification, "RAW_REMOTE");
});

test("unknown state stays unknown rather than defaulting to open", async () => {
  const out = normalizeHistory(await fixture("history-unknown.json"));
  assert.equal(out.context.state, null);
  assert.equal(out.context.stateProvenance.classification, "UNKNOWN");
  assert.equal(out.request.inputs, null);
  assert.equal(out.request.inputsProvenance.classification, "UNKNOWN");
});

import { canonicalJson } from "../src/canonical-json.mjs";
import { sha256Bytes, sha256CanonicalJson } from "../src/digest.mjs";
import { buildObservationManifest } from "../src/observation-pack.mjs";

test("canonical digest is stable across object key order", () => {
  const a = { b: 2, a: { y: 2, x: 1 } };
  const b = { a: { x: 1, y: 2 }, b: 2 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(sha256CanonicalJson(a), sha256CanonicalJson(b));
});

test("raw-byte digest differs from canonical semantic digest responsibilities", () => {
  const rawA = Buffer.from('{"a":1,"b":2}\n');
  const rawB = Buffer.from('{  "b": 2, "a": 1 }\n');
  assert.notEqual(sha256Bytes(rawA), sha256Bytes(rawB));
  assert.equal(sha256CanonicalJson(JSON.parse(rawA)), sha256CanonicalJson(JSON.parse(rawB)));
});

test("observation manifest binds raw bytes and normalized result without authenticity claims", () => {
  const rawBytes = Buffer.from(JSON.stringify({ entries: [] }));
  const normalized = normalizeHistory({ entries: [] });
  const manifest = buildObservationManifest({ mode: "inspect", rawBytes, normalized });
  assert.equal(manifest.source.sha256, sha256Bytes(rawBytes));
  assert.equal(manifest.normalized.canonicalSha256, sha256CanonicalJson(normalized));
  assert.equal(manifest.trust.integrityWithinPack, "HASH_BOUND");
  assert.equal(manifest.trust.sourceAuthenticity, "UNKNOWN");
  assert.equal(manifest.trust.independentTimeAuthority, "UNKNOWN");
});

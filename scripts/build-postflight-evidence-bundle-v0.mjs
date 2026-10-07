#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error("Missing required argument: " + name);
  return value;
}
function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const outputDir = requiredArg("--output-dir");

const mappings = [
  ["request-identity.json", requiredArg("--request-identity")],
  ["transition-envelope.json", requiredArg("--transition-envelope")],
  ["warrant-body.json", requiredArg("--warrant-body")],
  ["warrant.sig", requiredArg("--warrant-signature")],
  ["issuance-audit.json", requiredArg("--issuance-audit")],
  ["authority-state-events.jsonl", requiredArg("--authority-state-events")],
  ["e2-stage.json", requiredArg("--e2-stage")],
  ["e1-verification.json", requiredArg("--e1-verification")],
  ["transaction-proposal.json", requiredArg("--transaction-proposal")],
  ["transaction-evidence.json", requiredArg("--transaction-evidence")],
  ["transaction-receipt.json", requiredArg("--transaction-receipt")],
  ["instance-binding.json", requiredArg("--instance-binding")],
  ["e2-release.json", requiredArg("--e2-release")],
  ["released-payload.bin", requiredArg("--released-payload")],
  ["provider-observation.json", requiredArg("--provider-observation")],
  ["provider-received-payload.bin", requiredArg("--provider-payload")],
  ["gate-zero-result.json", requiredArg("--gate-zero-result")],
  ["conformance.json", requiredArg("--conformance")],
];

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const entries = [];
for (const [name, source] of mappings) {
  const bytes = await fs.readFile(source);
  await fs.writeFile(path.join(outputDir, name), bytes);
  entries.push({
    name,
    bytes: bytes.length,
    sha256: sha256(bytes),
  });
}

entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
const digestMaterial = Buffer.from(
  entries.map((x) => x.name + "=" + x.sha256 + "\n").join(""),
  "utf8"
);
const bundleDigest = sha256(digestMaterial);

const manifest = {
  schema: "workflow-observatory/postflight-evidence-manifest/v0",
  profile: "closed-harness/t0-v0",
  files: entries,
  bundle_digest_sha256: bundleDigest,
  file_count: entries.length,
};

await fs.writeFile(
  path.join(outputDir, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

console.log(JSON.stringify(manifest, null, 2));

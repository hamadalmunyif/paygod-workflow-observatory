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
function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const resultPath = requiredArg("--result");
const releaseRoot = path.resolve(argValue("--release-root") ?? "out/release");

const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
if (
  result?.schema !== "workflow-observatory/gate-zero-t0-witness/v0" ||
  !Array.isArray(result.attempts) ||
  result.attempts.length === 0
) {
  throw new Error("Unexpected Gate Zero T0 result schema");
}

const checks = [];
for (const attempt of result.attempts) {
  const evidencePath = attempt?.evidence_artifact_path;
  const expected = attempt?.evidence_sha256;
  if (typeof evidencePath !== "string" || !evidencePath.startsWith("out/release/")) {
    throw new Error("Invalid evidence path for " + attempt?.attempt_id);
  }
  if (!/^[a-f0-9]{64}$/.test(expected ?? "")) {
    throw new Error("Invalid evidence digest for " + attempt?.attempt_id);
  }

  const relative = evidencePath.slice("out/release/".length);
  const absolute = path.resolve(releaseRoot, relative);
  if (
    absolute !== releaseRoot &&
    !absolute.startsWith(releaseRoot + path.sep)
  ) {
    throw new Error("Evidence path escapes release root: " + evidencePath);
  }

  const bytes = await fs.readFile(absolute);
  const actual = digest(bytes);
  if (actual !== expected) {
    throw new Error(
      "Evidence digest mismatch for " +
        attempt.attempt_id +
        ": expected " +
        expected +
        ", observed " +
        actual
    );
  }

  checks.push({
    attempt_id: attempt.attempt_id,
    evidence_artifact_path: evidencePath,
    evidence_sha256: actual,
  });
}

const verification = {
  schema: "workflow-observatory/gate-zero-t0-evidence-verification/v0",
  result_sha256: digest(await fs.readFile(resultPath)),
  attempts_verified: checks.length,
  all_evidence_digests_match: true,
  checks,
};

const output = argValue("--output");
if (output) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(verification, null, 2) + "\n");
}

console.log(JSON.stringify(verification, null, 2));

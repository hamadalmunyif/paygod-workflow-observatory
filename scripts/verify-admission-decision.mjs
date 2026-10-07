#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { verifyAdmissionDecisionV0 } from "../src/release-decision-chain-v0.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const kernelCliPath = argValue("--kernel-cli");
const requestShadowPath = argValue("--request-shadow");
const admissionReceiptPath = argValue("--admission-receipt");
const admissionVerificationPath = argValue("--admission-verification");
const profilePath = argValue("--profile");
const outputPath = argValue("--output");

for (const [name, value] of [
  ["--kernel-cli", kernelCliPath],
  ["--request-shadow", requestShadowPath],
  ["--admission-receipt", admissionReceiptPath],
  ["--admission-verification", admissionVerificationPath],
  ["--profile", profilePath],
]) {
  if (!value) throw new Error("Missing required argument: " + name);
}
if (!fs.existsSync(kernelCliPath)) {
  throw new Error("Pinned PayGod CLI path does not exist: " + kernelCliPath);
}

const run = spawnSync(
  "dotnet",
  [kernelCliPath, "validate", "--input", requestShadowPath, "--json"],
  { encoding: "utf8" }
);
if (run.status !== 0) {
  throw new Error(
    "PayGod canonical validation failed: " +
      (run.stderr || run.stdout || "unknown error")
  );
}
const canonical = JSON.parse(run.stdout.trim());
if (canonical?.status !== "success" || typeof canonical?.data?.hash !== "string") {
  throw new Error("PayGod validate did not return request-shadow canonical hash");
}

const [admissionReceiptBytes, admissionVerification, profile] = await Promise.all([
  fsp.readFile(admissionReceiptPath),
  fsp.readFile(admissionVerificationPath, "utf8").then(JSON.parse),
  fsp.readFile(profilePath, "utf8").then(JSON.parse),
]);

const result = verifyAdmissionDecisionV0({
  requestShadowCanonicalHash: canonical.data.hash,
  admissionReceiptBytes,
  admissionVerification,
  profile,
});

const text = JSON.stringify(result, null, 2) + "\n";
if (outputPath) await fsp.writeFile(outputPath, text, "utf8");
process.stdout.write(text);

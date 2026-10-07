#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { verifyReleaseDecisionChainV0 } from "../src/release-decision-chain-v0.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const kernelCliPath = argValue("--kernel-cli");
const requestShadowPath = argValue("--request-shadow");
const admissionReceiptPath = argValue("--admission-receipt");
const admissionVerificationPath = argValue("--admission-verification");
const transitionEnvelopePath = argValue("--transition-envelope");
const releaseCandidatePath = argValue("--release-candidate");
const releaseReceiptPath = argValue("--release-receipt");
const releaseVerificationPath = argValue("--release-verification");
const profilePath = argValue("--profile");
const outputPath = argValue("--output");

const required = [
  ["--kernel-cli", kernelCliPath],
  ["--request-shadow", requestShadowPath],
  ["--admission-receipt", admissionReceiptPath],
  ["--admission-verification", admissionVerificationPath],
  ["--transition-envelope", transitionEnvelopePath],
  ["--release-candidate", releaseCandidatePath],
  ["--release-receipt", releaseReceiptPath],
  ["--release-verification", releaseVerificationPath],
  ["--profile", profilePath],
];
const missing = required.filter(([, value]) => !value).map(([name]) => name);
if (missing.length > 0) {
  throw new Error(
    "Missing required arguments: " + missing.join(", ")
  );
}
if (!fs.existsSync(kernelCliPath)) {
  throw new Error("Pinned PayGod CLI path does not exist: " + kernelCliPath);
}

function canonicalHashViaKernel(inputPath) {
  const run = spawnSync(
    "dotnet",
    [kernelCliPath, "validate", "--input", inputPath, "--json"],
    { encoding: "utf8" }
  );
  if (run.status !== 0) {
    throw new Error(
      "PayGod canonical validation failed for " +
        inputPath +
        ": " +
        (run.stderr || run.stdout || "unknown error")
    );
  }
  let result;
  try {
    result = JSON.parse(run.stdout.trim());
  } catch {
    throw new Error("PayGod validate returned non-JSON output for " + inputPath);
  }
  if (
    result?.status !== "success" ||
    typeof result?.data?.hash !== "string"
  ) {
    throw new Error("PayGod validate did not return a canonical hash for " + inputPath);
  }
  return result.data.hash;
}

const [
  requestShadow,
  admissionReceiptBytes,
  admissionVerification,
  transitionEnvelopeBytes,
  releaseCandidateBytes,
  releaseReceiptBytes,
  releaseVerification,
  profile,
] = await Promise.all([
  fsp.readFile(requestShadowPath, "utf8").then(JSON.parse),
  fsp.readFile(admissionReceiptPath),
  fsp.readFile(admissionVerificationPath, "utf8").then(JSON.parse),
  fsp.readFile(transitionEnvelopePath),
  fsp.readFile(releaseCandidatePath),
  fsp.readFile(releaseReceiptPath),
  fsp.readFile(releaseVerificationPath, "utf8").then(JSON.parse),
  fsp.readFile(profilePath, "utf8").then(JSON.parse),
]);

const requestShadowCanonicalHash = canonicalHashViaKernel(requestShadowPath);
const releaseCandidateCanonicalHash = canonicalHashViaKernel(releaseCandidatePath);

const result = verifyReleaseDecisionChainV0({
  requestShadow,
  requestShadowCanonicalHash,
  admissionReceiptBytes,
  admissionVerification,
  transitionEnvelopeBytes,
  releaseCandidateBytes,
  releaseCandidateCanonicalHash,
  releaseReceiptBytes,
  releaseVerification,
  profile,
});

const text = JSON.stringify(result, null, 2) + "\n";
if (outputPath) {
  await fsp.writeFile(outputPath, text, "utf8");
}
process.stdout.write(text);

#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { normalizeBrowse } from "../src/normalize-browse.mjs";
import { normalizeHistory } from "../src/normalize-history.mjs";
import { buildObservationManifest } from "../src/observation-pack.mjs";
import { canonicalJson } from "../src/canonical-json.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  let input = null;
  let query = null;
  let outputDir = null;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--input") input = rest[++i];
    else if (rest[i] === "--query") query = rest[++i];
    else if (rest[i] === "--output-dir") outputDir = rest[++i];
    else throw new Error(`Unknown argument: ${rest[i]}`);
  }
  return { command, input, query, outputDir };
}

async function readRaw(input) {
  if (input) return fs.readFile(input);
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks)));
    process.stdin.on("error", reject);
  });
}

function normalize(command, payload, query) {
  if (command === "discover") return normalizeBrowse(payload, { query });
  if (command === "inspect") return normalizeHistory(payload);
  throw new Error(`Unsupported command: ${command}`);
}

async function writePack(outputDir, mode, rawBytes, normalized) {
  await fs.mkdir(outputDir, { recursive: true });
  const rawPath = path.join(outputDir, "raw.json");
  const normalizedPath = path.join(outputDir, "normalized.json");
  const manifestPath = path.join(outputDir, "manifest.json");

  await fs.writeFile(rawPath, rawBytes);
  await fs.writeFile(normalizedPath, `${canonicalJson(normalized)}\n`, "utf8");
  const manifest = buildObservationManifest({ mode, rawBytes, normalized });
  await fs.writeFile(manifestPath, `${canonicalJson(manifest)}\n`, "utf8");
  return manifest;
}

const { command, input, query, outputDir } = parseArgs(process.argv.slice(2));
if (!command || !["discover", "inspect"].includes(command)) {
  throw new Error("Usage: workflow-observatory <discover|inspect> [--input file.json] [--query text] [--output-dir dir]");
}

const rawBytes = await readRaw(input);
const payload = JSON.parse(rawBytes.toString("utf8"));
const output = normalize(command, payload, query);

if (outputDir) {
  const manifest = await writePack(outputDir, command, rawBytes, output);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

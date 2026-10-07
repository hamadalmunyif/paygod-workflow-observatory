#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const host = process.env.PROVIDER_HOST ?? "127.0.0.1";
const port = Number(process.env.PROVIDER_PORT ?? "18547");
const outputDir = process.env.PROVIDER_OUTPUT_DIR ?? "out/release/provider";
const providerIdentity = String(process.env.PROVIDER_IDENTITY ?? "").toLowerCase();

if (!/^0x[0-9a-f]{40}$/.test(providerIdentity)) {
  throw new Error("PROVIDER_IDENTITY must be a lowercase EVM address");
}

await fs.mkdir(outputDir, { recursive: true });

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function requiredHeader(req, name) {
  const value = req.headers[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("missing header " + name);
  }
  return value;
}
async function writeObservation({ bytes, transition, jobId, txHash, contentType }) {
  const observationPath = path.join(outputDir, "provider-observation.json");
  const payloadPath = path.join(outputDir, "provider-received-payload.bin");
  try {
    await fs.access(observationPath);
    throw new Error("provider observation already exists");
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }

  const observedAt = Date.now();
  const observation = {
    schema: "workflow-observatory/provider-observation/v0",
    observation_class: "RUNTIME_OBSERVED",
    provider_identity: providerIdentity,
    transition_commitment: transition,
    derived_job_id: jobId,
    transaction_hash: txHash,
    payload_sha256: sha256(bytes),
    payload_byte_length: bytes.length,
    payload_content_type: contentType,
    observed_at_ms: observedAt,
  };
  await fs.writeFile(payloadPath, bytes, { flag: "wx" });
  try {
    await fs.writeFile(
      observationPath,
      JSON.stringify(observation, null, 2) + "\n",
      { encoding: "utf8", flag: "wx" }
    );
  } catch (err) {
    await fs.rm(payloadPath, { force: true });
    throw err;
  }
  return observation;
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/release") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
    return;
  }

  try {
    const claimedProvider = requiredHeader(req, "x-paygod-provider").toLowerCase();
    const transition = requiredHeader(req, "x-paygod-transition");
    const jobId = requiredHeader(req, "x-paygod-job-id");
    const txHash = requiredHeader(req, "x-paygod-tx-hash").toLowerCase();
    const contentType = requiredHeader(req, "x-paygod-payload-content-type");

    if (claimedProvider !== providerIdentity) {
      throw new Error("provider identity mismatch");
    }
    if (!/^[0-9]+$/.test(jobId)) {
      throw new Error("job id must be decimal text");
    }
    if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
      throw new Error("transaction hash must be lowercase 32-byte hex");
    }
    if (!/^[0-9a-f]{64}$/.test(transition)) {
      throw new Error("transition commitment must be 64 lowercase hex");
    }

    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > 1024 * 1024) throw new Error("payload too large");
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const observation = await writeObservation({
      bytes,
      transition,
      jobId,
      txHash,
      contentType,
    });

    const body = Buffer.from(JSON.stringify({ status: "OBSERVED", observation }), "utf8");
    res.writeHead(200, {
      "content-type": "application/json",
      "content-length": String(body.length),
    });
    res.end(body);
  } catch (err) {
    const body = Buffer.from(JSON.stringify({
      status: "REJECTED",
      error: String(err?.message ?? err),
    }), "utf8");
    res.writeHead(400, {
      "content-type": "application/json",
      "content-length": String(body.length),
    });
    res.end(body);
  }
});

server.listen(port, host, async () => {
  await fs.writeFile(
    path.join(outputDir, "provider-ready.json"),
    JSON.stringify({
      schema: "workflow-observatory/provider-worker-ready/v0",
      host,
      port,
      provider_identity: providerIdentity,
    }, null, 2) + "\n",
    "utf8"
  );
  process.stdout.write(`Provider P listening on ${host}:${port}\n`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

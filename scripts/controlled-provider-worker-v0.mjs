#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const host = process.env.PROVIDER_HOST ?? "127.0.0.1";
const port = Number(process.env.PROVIDER_PORT ?? "18547");
const outputDir =
  process.env.PROVIDER_OUTPUT_DIR ?? "out/release/provider";
const expectedProvider = String(
  process.env.PROVIDER_IDENTITY ?? ""
).toLowerCase();
const expectedContentType =
  process.env.PROVIDER_CONTENT_TYPE ?? "requirement";

if (!/^0x[0-9a-f]{40}$/.test(expectedProvider)) {
  throw new Error("PROVIDER_IDENTITY must be a lowercase EVM address");
}
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PROVIDER_PORT invalid");
}

fs.mkdirSync(outputDir, { recursive: true });
const observationPath = path.join(outputDir, "provider-observation.json");
const payloadPath = path.join(outputDir, "provider-received-payload.bin");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sendJson(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(bytes.length),
  });
  res.end(bytes);
}

function header(req, name) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/v0/release") {
    return sendJson(res, 404, {
      status: "REJECTED",
      code: "PROVIDER_ROUTE_REJECTED",
    });
  }

  if (fs.existsSync(observationPath) || fs.existsSync(payloadPath)) {
    return sendJson(res, 409, {
      status: "REJECTED",
      code: "PROVIDER_ALREADY_OBSERVED",
    });
  }

  const contentType = String(header(req, "content-type") ?? "").toLowerCase();
  if (contentType !== "application/octet-stream") {
    return sendJson(res, 415, {
      status: "REJECTED",
      code: "PROVIDER_CONTENT_TYPE_REJECTED",
    });
  }

  const transitionCommitment = String(
    header(req, "x-paygod-transition-commitment") ?? ""
  ).toLowerCase();
  const instanceId = String(
    header(req, "x-paygod-instance-id") ?? ""
  );
  const transactionHash = String(
    header(req, "x-paygod-transaction-hash") ?? ""
  ).toLowerCase();
  const providerRecipient = String(
    header(req, "x-paygod-provider-recipient") ?? ""
  ).toLowerCase();
  const expectedPayloadSha256 = String(
    header(req, "x-paygod-payload-sha256") ?? ""
  ).toLowerCase();
  const payloadContentType = String(
    header(req, "x-paygod-payload-content-type") ?? ""
  );

  if (!/^[0-9a-f]{64}$/.test(transitionCommitment)) {
    return sendJson(res, 400, {
      status: "REJECTED",
      code: "PROVIDER_TRANSITION_INVALID",
    });
  }
  if (!/^[1-9][0-9]*$/.test(instanceId)) {
    return sendJson(res, 400, {
      status: "REJECTED",
      code: "PROVIDER_INSTANCE_INVALID",
    });
  }
  if (!/^0x[0-9a-f]{64}$/.test(transactionHash)) {
    return sendJson(res, 400, {
      status: "REJECTED",
      code: "PROVIDER_TX_HASH_INVALID",
    });
  }
  if (providerRecipient !== expectedProvider) {
    return sendJson(res, 403, {
      status: "REJECTED",
      code: "PROVIDER_IDENTITY_MISMATCH",
    });
  }
  if (!/^[0-9a-f]{64}$/.test(expectedPayloadSha256)) {
    return sendJson(res, 400, {
      status: "REJECTED",
      code: "PROVIDER_PAYLOAD_DIGEST_INVALID",
    });
  }
  if (payloadContentType !== expectedContentType) {
    return sendJson(res, 400, {
      status: "REJECTED",
      code: "PROVIDER_PAYLOAD_CONTENT_TYPE_MISMATCH",
    });
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1024 * 1024) {
      return sendJson(res, 413, {
        status: "REJECTED",
        code: "PROVIDER_PAYLOAD_TOO_LARGE",
      });
    }
    chunks.push(chunk);
  }

  const payloadBytes = Buffer.concat(chunks);
  const observedPayloadSha256 = sha256(payloadBytes);
  if (observedPayloadSha256 !== expectedPayloadSha256) {
    return sendJson(res, 400, {
      status: "REJECTED",
      code: "PROVIDER_PAYLOAD_DIGEST_MISMATCH",
    });
  }

  const observedAtMs = Date.now();
  const observation = {
    schema: "workflow-observatory/provider-observation/v0",
    status: "OBSERVED",
    observation_grade: "RUNTIME_OBSERVED",
    payload_sha256: observedPayloadSha256,
    payload_byte_length: payloadBytes.length,
    content_type: payloadContentType,
    provider_identity: expectedProvider,
    transition_commitment: transitionCommitment,
    instance_id: instanceId,
    transaction_hash: transactionHash,
    observed_at_ms: observedAtMs,
    time_authority: "producer_supplied",
  };

  const payloadTmp = payloadPath + ".tmp";
  const observationTmp = observationPath + ".tmp";
  fs.writeFileSync(payloadTmp, payloadBytes);
  fs.writeFileSync(
    observationTmp,
    JSON.stringify(observation, null, 2) + "\n",
    "utf8"
  );
  fs.renameSync(payloadTmp, payloadPath);
  fs.renameSync(observationTmp, observationPath);

  return sendJson(res, 200, observation);
});

server.listen(port, host, () => {
  process.stdout.write(
    `Controlled provider listening on ${host}:${port}\n`
  );
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

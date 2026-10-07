#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import process from "node:process";

const upstreamUrl = process.env.RPC_UPSTREAM_URL ?? "http://127.0.0.1:18545";
const host = process.env.RPC_PROXY_HOST ?? "0.0.0.0";
const port = Number(process.env.RPC_PROXY_PORT ?? "18546");
const auditPath = process.env.RPC_PROXY_AUDIT ?? "out/release/local-evm/r-client-audit.jsonl";

const allowed = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  "eth_getCode",
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_call",
  "eth_estimateGas",
  "eth_sendRawTransaction",
  "net_version",
]);

fs.mkdirSync(new URL(".", "file://" + process.cwd() + "/" + auditPath).pathname.replace(/\/[^/]*$/, ""), { recursive: true });

function audit(event) {
  fs.appendFileSync(
    auditPath,
    JSON.stringify({
      at_ms: Date.now(),
      ...event,
    }) + "\n",
    "utf8"
  );
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function sendJson(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(bytes.length),
  });
  res.end(bytes);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    audit({ decision: "rejected", reason: "HTTP_METHOD", method: null, id: null });
    return sendJson(res, 405, rpcError(null, -32600, "POST required"));
  }

  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    audit({ decision: "rejected", reason: "CONTENT_TYPE", method: null, id: null });
    return sendJson(res, 415, rpcError(null, -32600, "application/json required"));
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1024 * 1024) {
      audit({ decision: "rejected", reason: "BODY_TOO_LARGE", method: null, id: null });
      return sendJson(res, 413, rpcError(null, -32600, "request too large"));
    }
    chunks.push(chunk);
  }

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    audit({ decision: "rejected", reason: "INVALID_JSON", method: null, id: null });
    return sendJson(res, 400, rpcError(null, -32700, "invalid JSON"));
  }

  if (
    !body ||
    Array.isArray(body) ||
    typeof body !== "object" ||
    body.jsonrpc !== "2.0" ||
    typeof body.method !== "string" ||
    body.method.length === 0 ||
    !(
      body.params === undefined ||
      Array.isArray(body.params) ||
      (body.params !== null && typeof body.params === "object")
    )
  ) {
    audit({
      decision: "rejected",
      reason: "REQUEST_PROFILE",
      method: typeof body?.method === "string" ? body.method : null,
      id: body?.id ?? null,
    });
    return sendJson(res, 400, rpcError(body?.id, -32600, "invalid JSON-RPC request profile"));
  }

  if (!allowed.has(body.method)) {
    audit({
      decision: "rejected",
      reason: "METHOD_NOT_ALLOWED",
      method: body.method,
      id: body.id ?? null,
      forwarded: false,
    });
    return sendJson(
      res,
      200,
      rpcError(body.id, -32099, "PAYGOD_HARNESS_RPC_METHOD_REJECTED")
    );
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    audit({
      decision: "failed_closed",
      reason: "UPSTREAM_UNREACHABLE",
      method: body.method,
      id: body.id ?? null,
      forwarded: true,
    });
    return sendJson(res, 502, rpcError(body.id, -32098, "RPC upstream unavailable"));
  }

  const text = await upstream.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    audit({
      decision: "failed_closed",
      reason: "UPSTREAM_MALFORMED",
      method: body.method,
      id: body.id ?? null,
      forwarded: true,
    });
    return sendJson(res, 502, rpcError(body.id, -32097, "RPC upstream malformed"));
  }

  audit({
    decision: "forwarded",
    reason: "ALLOWLIST",
    method: body.method,
    id: body.id ?? null,
    forwarded: true,
    upstream_http_status: upstream.status,
    upstream_has_error: Boolean(parsed?.error),
  });
  return sendJson(res, upstream.ok ? 200 : 502, parsed);
});

server.listen(port, host, () => {
  audit({
    decision: "proxy_started",
    reason: "READY",
    method: null,
    id: null,
    host,
    port,
    upstream: upstreamUrl,
  });
  process.stdout.write(`R-client listening on ${host}:${port}\n`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    audit({ decision: "proxy_stopping", reason: signal, method: null, id: null });
    server.close(() => process.exit(0));
  });
}

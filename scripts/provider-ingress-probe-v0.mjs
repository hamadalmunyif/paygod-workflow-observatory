#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

const providerUrl = process.env.PROVIDER_URL;
const output = process.env.PROVIDER_PROBE_OUTPUT ?? "/work/out/provider-ingress-probe.json";

if (!providerUrl) throw new Error("PROVIDER_URL is required");

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 1500);
let result;
try {
  const response = await fetch(providerUrl, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-paygod-provider": "0x3333333333333333333333333333333333333333",
      "x-paygod-transition": "11".repeat(32),
      "x-paygod-job-id": "1",
      "x-paygod-tx-hash": "0x" + "22".repeat(32),
      "x-paygod-payload-content-type": "requirement",
    },
    body: Buffer.from("adversarial-provider-probe", "utf8"),
    signal: controller.signal,
  });
  result = {
    schema: "workflow-observatory/provider-ingress-probe/v0",
    reachable: true,
    http_status: response.status,
    response_text: (await response.text()).slice(0, 500),
  };
} catch (err) {
  result = {
    schema: "workflow-observatory/provider-ingress-probe/v0",
    reachable: false,
    error_name: err?.name ?? "Error",
    error_message: String(err?.message ?? err),
  };
} finally {
  clearTimeout(timer);
}

await fs.writeFile(output, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify(result, null, 2));

if (result.reachable) {
  process.exitCode = 42;
}

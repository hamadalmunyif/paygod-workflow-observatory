import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const acpCliDir = process.env.ACP_CLI_DIR;
if (!acpCliDir) throw new Error("ACP_CLI_DIR is required");

const query = process.env.ACP_QUERY ?? "congress";
const topK = Number(process.env.ACP_TOP_K ?? "10");
const timeoutSeconds = Number(process.env.ACP_AUTH_TIMEOUT_SECONDS ?? "600");
const outFile = process.env.ACP_CAPTURE_FILE ?? "out/live/raw-browse.json";

if (!Number.isInteger(topK) || topK <= 0) throw new Error("ACP_TOP_K must be a positive integer");
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) throw new Error("ACP_AUTH_TIMEOUT_SECONDS must be positive");

async function importAcp(relativePath: string) {
  return import(pathToFileURL(path.join(acpCliDir, relativePath)).href);
}

const { getClient, ApiClient } = await importAcp("src/lib/api/client.ts");
const { AgentApi } = await importAcp("src/lib/api/agent.ts");
const { getServerUrl } = await importAcp("src/lib/config.ts");

const { authApi } = await getClient(true);
const { url, requestId } = await authApi.getCliUrl();

console.log("");
console.log("=== HUMAN AUTHORIZATION REQUIRED ===");
console.log(url);
console.log("Open the URL above, confirm the existing Virtuals account, then return to this Actions run.");
console.log("The job will poll for authorization without creating an Agent or Signer.");
console.log("====================================");
console.log("");

const deadline = Date.now() + timeoutSeconds * 1000;
let authResult: { token: string; refreshToken: string; walletAddress: string } | null = null;

while (Date.now() < deadline) {
  authResult = await authApi.pollCliToken(requestId);
  if (authResult) break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

if (!authResult) throw new Error("ACP authentication timed out before a token was issued");

console.log(`::add-mask::${authResult.token}`);
console.log(`::add-mask::${authResult.refreshToken}`);

const agentApi = new AgentApi(new ApiClient(getServerUrl(false), authResult.token));
const response = await agentApi.browse(query, undefined, { topK });

await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, JSON.stringify(response) + "\n", { encoding: "utf8", flag: "wx" });

const resultCount = Array.isArray(response?.data) ? response.data.length : null;
console.log(`ACP browse capture written: ${outFile}`);
console.log(`Query: ${query}`);
console.log(`Result count: ${resultCount ?? "unknown"}`);
console.log("Acquisition path: getClient(true) -> AuthApi -> AgentApi.browse -> GET /agents/search");
console.log("No Agent creation, signer configuration, job creation, funding, resource invocation, or transaction call is performed by this script.");

#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing environment variable: " + name);
  return value;
}

async function probePath(targetPath) {
  let readable = false;
  let writable = false;
  let readError = null;
  let writeError = null;

  try {
    await fs.readFile(targetPath);
    readable = true;
  } catch (err) {
    readError = err?.code ?? err?.name ?? "ERROR";
  }

  try {
    const handle = await fs.open(targetPath, "r+");
    writable = true;
    await handle.close();
  } catch (err) {
    writeError = err?.code ?? err?.name ?? "ERROR";
  }

  return {
    path: targetPath,
    readable,
    writable,
    read_error: readError,
    write_error: writeError,
  };
}

const protectedKeyHostPath = required("PROTECTED_KEY_HOST_PATH");
const s0HostPath = required("S0_HOST_PATH");
const outputPath = required("BOUNDARY_PROBE_OUTPUT");

const protectedKey = await probePath(protectedKeyHostPath);
const s0 = await probePath(s0HostPath);
const dockerSocket = await probePath("/var/run/docker.sock");

const suspiciousSecretEnv = Object.keys(process.env)
  .filter((name) =>
    /(?:PRIVATE.*KEY|KEY.*PRIVATE|EXECUTION_KEY|STATE_DB|WARRANT_ISSUER_PRIVATE|DECISION_PRIVATE)/i.test(
      name
    )
  )
  .filter(
    (name) =>
      ![
        "PROTECTED_KEY_HOST_PATH",
        "S0_HOST_PATH",
      ].includes(name)
  )
  .sort();

if (protectedKey.readable || protectedKey.writable) {
  throw new Error(
    "T0-KEY-REACH bypass: C can access the protected execution key host path"
  );
}
if (s0.readable || s0.writable) {
  throw new Error(
    "T0-S0-REACH bypass: C can access the authority-state database host path"
  );
}
if (dockerSocket.readable || dockerSocket.writable) {
  throw new Error(
    "T0 boundary defect: C can access the Docker control socket"
  );
}
if (suspiciousSecretEnv.length !== 0) {
  throw new Error(
    "T0 boundary defect: secret-like environment names exposed to C: " +
      suspiciousSecretEnv.join(",")
  );
}

const mountInfo = await fs.readFile("/proc/self/mountinfo", "utf8");
const result = {
  schema: "workflow-observatory/t0-client-boundary-probe/v0",
  result: "NO_CLIENT_SECRET_OR_S0_REACHABILITY_OBSERVED",
  protected_key_host_path_readable: false,
  protected_key_host_path_writable: false,
  s0_host_path_readable: false,
  s0_host_path_writable: false,
  docker_socket_readable: false,
  docker_socket_writable: false,
  suspicious_secret_env_names: [],
  mountinfo_contains_protected_key_host_path: mountInfo.includes(
    protectedKeyHostPath
  ),
  mountinfo_contains_s0_host_path: mountInfo.includes(s0HostPath),
  probes: {
    protected_key: protectedKey,
    authority_state: s0,
    docker_socket: dockerSocket,
  },
};

if (
  result.mountinfo_contains_protected_key_host_path ||
  result.mountinfo_contains_s0_host_path
) {
  throw new Error("T0 boundary defect: host secret/state path appears in mountinfo");
}

await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify(result, null, 2));

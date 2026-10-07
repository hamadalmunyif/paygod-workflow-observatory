#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error("Missing required argument: " + name);
  return value;
}

const dbPath = requiredArg("--state-db");
const warrant = JSON.parse(await fs.readFile(requiredArg("--warrant-body"), "utf8"));
const output = requiredArg("--output");

const store = await openAuthorityStateStoreV0(dbPath);
try {
  const events = store.listEvents({
    issuerKeyId: warrant.issuer_key_id,
    nonce: warrant.nonce,
  });
  if (events.length === 0) throw new Error("no authority-state events found");
  const bytes = Buffer.from(
    events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    "utf8"
  );
  await fs.writeFile(output, bytes);
  console.log(JSON.stringify({
    status: "EXPORTED",
    events: events.length,
    final_state: events.at(-1)?.newState ?? null,
    output,
  }, null, 2));
} finally {
  store.close();
}

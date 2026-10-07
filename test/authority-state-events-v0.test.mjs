import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sha256Bytes } from "../src/digest.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";

let sqliteAvailable = false;
try {
  await import("node:sqlite");
  sqliteAvailable = true;
} catch {}

test(
  "S0 durably records the complete successful authority-state sequence",
  { skip: !sqliteAvailable },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paygod-s0-events-"));
    const dbPath = path.join(dir, "authority.db");
    let now = 1_800_000_000_000;
    const key = {
      issuerKeyId: "ed25519-spki-sha256:" + "11".repeat(32),
      nonce: "22".repeat(32),
    };
    const transitionCommitment = "33".repeat(32);
    const warrantBodySha256 = "44".repeat(32);
    const payload = Buffer.from('{"company":"Example"}', "utf8");
    const payloadSha256 = sha256Bytes(payload);
    const domain = "controlled-harness/t0-v0";

    const store = await openAuthorityStateStoreV0(dbPath, {
      now: () => now++,
    });
    try {
      store.registerIssued({
        ...key,
        transitionCommitment,
        enforcementDomain: domain,
        notBefore: 1_799_999_999_000,
        expiresAt: 1_800_000_100_000,
        warrantBodySha256,
        requestedBy: "I",
      });
      store.stagePayloadExact({
        ...key,
        transitionCommitment,
        enforcementDomain: domain,
        warrantBodySha256,
        payloadBytes: payload,
        payloadChannel: "controlled-requirement-message/v0",
        payloadRecipient: "0x" + "55".repeat(20),
        payloadContentType: "requirement",
        requestedBy: "E2",
      });
      store.reserveTransaction({
        ...key,
        transitionCommitment,
        enforcementDomain: domain,
        warrantBodySha256,
        requestedBy: "E1",
      });
      store.markTxExecuted({
        ...key,
        transitionCommitment,
        enforcementDomain: domain,
        txEvidenceSha256: "66".repeat(32),
        requestedBy: "E1",
      });
      store.releasePayload({
        ...key,
        transitionCommitment,
        enforcementDomain: domain,
        payloadSha256,
        requestedBy: "E2",
      });
      store.markConformant({
        ...key,
        transitionCommitment,
        enforcementDomain: domain,
        requestedBy: "V",
      });

      const events = store.listEvents(key);
      assert.deepEqual(
        events.map((x) => x.newState),
        [
          "ISSUED",
          "PAYLOAD_STAGED",
          "TX_RESERVED",
          "TX_EXECUTED",
          "PAYLOAD_RELEASED",
          "CONFORMANT",
        ]
      );
      assert.deepEqual(
        events.map((x) => x.requestedBy),
        ["I", "E2", "E1", "E1", "E2", "V"]
      );
      assert.ok(events.every((x) => x.result === "SUCCESS"));
      assert.equal(events[0].priorState, null);
      assert.equal(events[5].priorState, "PAYLOAD_RELEASED");
    } finally {
      store.close();
    }

    const reopened = await openAuthorityStateStoreV0(dbPath);
    try {
      const events = reopened.listEvents(key);
      assert.equal(events.length, 6);
      assert.equal(reopened.get(key).state, "CONFORMANT");
    } finally {
      reopened.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
);

#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

import { AuthorityError } from "../src/authority-error.mjs";
import { openAuthorityStateStoreV0 } from "../src/authority-state-v0.mjs";
import { stagePayloadThroughE2V0 } from "../src/e2-payload-gate-v0.mjs";
import { reserveTransactionThroughE1V0 } from "../src/e1-transaction-gate-v0.mjs";
import { parseExactTransitionEnvelopeV0 } from "../src/transition-envelope-v0.mjs";
import {
  buildWarrantBodyV0,
  freshWarrantNonceV0,
  generateIssuerKeyPairV0,
  parseExactWarrantBodyV0,
  signWarrantBodyV0,
} from "../src/warrant-v0.mjs";
import {
  buildWarrantIssuerTrustStoreV0,
  trustedWarrantIssuersFromExternalTrustV0,
} from "../src/warrant-issuer-trust-v0.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error("Missing required argument: " + name);
  return value;
}
function exactCalldataBytes(proposal) {
  if (!/^0x(?:[0-9a-f]{2})+$/.test(proposal.calldata_hex)) {
    throw new Error("proposal calldata_hex invalid");
  }
  return Buffer.from(proposal.calldata_hex.slice(2), "hex");
}
function transactionFromProposal(proposal) {
  return {
    system: proposal.system,
    chainId: proposal.chain_id,
    executionAccount: proposal.execution_account,
    target: proposal.target,
    calldataBytes: exactCalldataBytes(proposal),
    nativeValue: proposal.native_value,
  };
}
function expectAuthorityError(fn, code) {
  try {
    fn();
  } catch (err) {
    if (err instanceof AuthorityError && err.code === code) {
      return { code: err.code, message: err.message };
    }
    throw err;
  }
  throw new Error("expected authority error " + code + " but operation succeeded");
}
async function runWorker({ workerId, common, stateDb, barrier }) {
  const args = [
    path.resolve("scripts/gate-zero-e1-reserve-worker-v0.mjs"),
    "--warrant-body", common.warrantBodyPath,
    "--warrant-signature", common.warrantSignaturePath,
    "--warrant-trust-store", common.trustPath,
    "--transition-envelope", common.envelopePath,
    "--transaction-proposal", common.proposalPath,
    "--state-db", stateDb,
    "--barrier", barrier,
    "--worker-id", workerId,
  ];
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (x) => { stdout += x; });
    child.stderr.on("data", (x) => { stderr += x; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(
          "reservation worker " + workerId + " failed: " + stderr.trim()
        ));
        return;
      }
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
      try {
        resolve(JSON.parse(line));
      } catch {
        reject(new Error(
          "reservation worker " + workerId + " emitted invalid JSON: " + stdout
        ));
      }
    });
  });
}

const phase = requiredArg("--phase");
const outputDir = requiredArg("--output-dir");
const warrantBodyPath = requiredArg("--warrant-body");
const warrantSignaturePath = requiredArg("--warrant-signature");
const trustPath = requiredArg("--warrant-trust-store");
const envelopePath = requiredArg("--transition-envelope");
const proposalPath = requiredArg("--transaction-proposal");
const payloadPath = requiredArg("--payload");
const stateDbPath = requiredArg("--state-db");
const payloadChannel = requiredArg("--payload-channel");
const payloadRecipient = requiredArg("--payload-recipient");
const payloadContentType = requiredArg("--payload-content-type");

await fs.mkdir(outputDir, { recursive: true });

const [
  warrantBodyBytes,
  warrantSignatureBytes,
  trustBytes,
  envelopeBytes,
  proposal,
  payloadBytes,
] = await Promise.all([
  fs.readFile(warrantBodyPath),
  fs.readFile(warrantSignaturePath),
  fs.readFile(trustPath),
  fs.readFile(envelopePath),
  fs.readFile(proposalPath, "utf8").then(JSON.parse),
  fs.readFile(payloadPath),
]);

const parsedWarrant = parseExactWarrantBodyV0(warrantBodyBytes);
const transition = parseExactTransitionEnvelopeV0(envelopeBytes);
const trust = trustedWarrantIssuersFromExternalTrustV0({
  trustStore: JSON.parse(trustBytes.toString("utf8")),
  trustStoreBytes: trustBytes,
});
const key = {
  issuerKeyId: parsedWarrant.body.issuer_key_id,
  nonce: parsedWarrant.body.nonce,
};
const common = {
  warrantBodyPath,
  warrantSignaturePath,
  trustPath,
  envelopePath,
  proposalPath,
};

if (phase === "pre-e2") {
  const store = await openAuthorityStateStoreV0(stateDbPath);
  try {
    const changedPayload = Buffer.concat([payloadBytes, Buffer.from([0x20])]);
    const mismatch = expectAuthorityError(
      () => stagePayloadThroughE2V0({
        warrantBodyBytes,
        warrantSignatureBytes,
        trustedWarrantIssuers: trust.trustedIssuers,
        transitionEnvelopeBytes: envelopeBytes,
        payloadBytes: changedPayload,
        payloadChannel,
        payloadRecipient,
        payloadContentType,
        authorityStateStore: store,
        expectedDomain: trust.enforcementDomain,
      }),
      "E2_PAYLOAD_DIGEST_MISMATCH"
    );
    const row = store.get(key);
    const stage = store.getStagedPayload(key);
    if (row?.state !== "ISSUED" || stage !== null) {
      throw new Error("changed payload altered S0 before legitimate staging");
    }

    const { publicKey, privateKey } = generateIssuerKeyPairV0();
    const attackerTrust = buildWarrantIssuerTrustStoreV0({ publicKey });
    const attackerBody = buildWarrantBodyV0({
      transitionCommitment: transition.transitionCommitment,
      notBefore: parsedWarrant.body.not_before,
      expiresAt: parsedWarrant.body.expires_at,
      nonce: freshWarrantNonceV0(),
      issuerKeyId: attackerTrust.issuerKeyId,
      enforcementDomain: parsedWarrant.body.enforcement_domain,
    });
    const attackerSig = signWarrantBodyV0({
      bodyBytes: attackerBody.bytes,
      privateKey,
      publicKey,
    });
    const attackerParsedTrust = trustedWarrantIssuersFromExternalTrustV0({
      trustStore: attackerTrust.trust,
      trustStoreBytes: attackerTrust.bytes,
    });
    const trustSubstitution = expectAuthorityError(
      () => stagePayloadThroughE2V0({
        warrantBodyBytes: attackerBody.bytes,
        warrantSignatureBytes: attackerSig.signatureBytes,
        trustedWarrantIssuers: attackerParsedTrust.trustedIssuers,
        transitionEnvelopeBytes: envelopeBytes,
        payloadBytes,
        payloadChannel,
        payloadRecipient,
        payloadContentType,
        authorityStateStore: store,
        expectedDomain: attackerParsedTrust.enforcementDomain,
      }),
      "S0_RECORD_NOT_FOUND"
    );

    const result = {
      schema: "workflow-observatory/gate-zero-t0-phase/v0",
      phase,
      attempts: {
        "T0-E2-01": {
          status: "REJECTED_AS_EXPECTED",
          observed_code: mismatch.code,
          s0_state_after: row.state,
          staged_payload_exists: false,
        },
        "T0-CONFIG-01-support": {
          status: "REJECTED_AS_EXPECTED",
          observed_code: trustSubstitution.code,
          note: "Attacker-authored trust plus attacker Warrant cannot upgrade unregistered S0 authority; C control-path isolation is recorded separately.",
        },
      },
    };
    await fs.writeFile(
      path.join(outputDir, "pre-e2.json"),
      JSON.stringify(result, null, 2) + "\n"
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    store.close();
  }
} else if (phase === "post-e2") {
  const store = await openAuthorityStateStoreV0(stateDbPath);
  try {
    const original = store.getStagedPayload(key);
    if (!original?.payloadBytes?.equals(payloadBytes)) {
      throw new Error("legitimate staged payload missing before replacement attempt");
    }
    const replacement = expectAuthorityError(
      () => stagePayloadThroughE2V0({
        warrantBodyBytes,
        warrantSignatureBytes,
        trustedWarrantIssuers: trust.trustedIssuers,
        transitionEnvelopeBytes: envelopeBytes,
        payloadBytes,
        payloadChannel,
        payloadRecipient,
        payloadContentType,
        authorityStateStore: store,
        expectedDomain: trust.enforcementDomain,
      }),
      "S0_STATE_INVALID"
    );
    const after = store.getStagedPayload(key);
    if (!after?.payloadBytes?.equals(payloadBytes)) {
      throw new Error("staged payload changed after replacement attempt");
    }
  } finally {
    store.close();
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paygod-t0-race-"));
  const raceDb = path.join(tempDir, "authority.db");
  const raceStore = await openAuthorityStateStoreV0(raceDb);
  try {
    raceStore.registerIssued({
      issuerKeyId: parsedWarrant.body.issuer_key_id,
      nonce: parsedWarrant.body.nonce,
      transitionCommitment: parsedWarrant.body.transition_commitment,
      enforcementDomain: parsedWarrant.body.enforcement_domain,
      notBefore: parsedWarrant.body.not_before,
      expiresAt: parsedWarrant.body.expires_at,
      warrantBodySha256: parsedWarrant.bodySha256,
    });
    stagePayloadThroughE2V0({
      warrantBodyBytes,
      warrantSignatureBytes,
      trustedWarrantIssuers: trust.trustedIssuers,
      transitionEnvelopeBytes: envelopeBytes,
      payloadBytes,
      payloadChannel,
      payloadRecipient,
      payloadContentType,
      authorityStateStore: raceStore,
      expectedDomain: trust.enforcementDomain,
    });
  } finally {
    raceStore.close();
  }

  const barrier = path.join(tempDir, "go");
  const a = runWorker({ workerId: "A", common, stateDb: raceDb, barrier });
  const b = runWorker({ workerId: "B", common, stateDb: raceDb, barrier });
  await new Promise((resolve) => setTimeout(resolve, 150));
  await fs.writeFile(barrier, "go\n");
  const workers = await Promise.all([a, b]);

  const reserved = workers.filter((x) => x.outcome === "RESERVED");
  const rejected = workers.filter((x) => x.outcome === "REJECTED");
  if (
    reserved.length !== 1 ||
    rejected.length !== 1 ||
    rejected[0].code !== "S0_STATE_INVALID"
  ) {
    throw new Error("concurrent double-use did not resolve to exactly one reservation: " + JSON.stringify(workers));
  }

  const verifyRace = await openAuthorityStateStoreV0(raceDb);
  let raceState;
  try {
    raceState = verifyRace.get(key);
    if (raceState?.state !== "TX_RESERVED") {
      throw new Error("race S0 did not end at TX_RESERVED");
    }
  } finally {
    verifyRace.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  const result = {
    schema: "workflow-observatory/gate-zero-t0-phase/v0",
    phase,
    attempts: {
      "T0-E2-02": {
        status: "REJECTED_AS_EXPECTED",
        observed_code: "S0_STATE_INVALID",
        original_payload_preserved: true,
      },
      "T0-REPLAY-03": {
        status: "REJECTED_AS_EXPECTED",
        worker_results: workers,
        final_state: raceState.state,
        successful_reservations: reserved.length,
      },
    },
  };
  await fs.writeFile(
    path.join(outputDir, "post-e2.json"),
    JSON.stringify(result, null, 2) + "\n"
  );
  console.log(JSON.stringify(result, null, 2));
} else if (phase === "post-e1") {
  let firstReplay;
  {
    const store = await openAuthorityStateStoreV0(stateDbPath);
    try {
      const row = store.get(key);
      if (row?.state !== "TX_EXECUTED") {
        throw new Error("post-E1 witness requires TX_EXECUTED");
      }
      firstReplay = expectAuthorityError(
        () => reserveTransactionThroughE1V0({
          warrantBodyBytes,
          warrantSignatureBytes,
          trustedWarrantIssuers: trust.trustedIssuers,
          transitionEnvelopeBytes: envelopeBytes,
          transaction: transactionFromProposal(proposal),
          authorityStateStore: store,
          expectedDomain: trust.enforcementDomain,
        }),
        "S0_STATE_INVALID"
      );
    } finally {
      store.close();
    }
  }

  let restartReplay;
  let persistedState;
  {
    const reopened = await openAuthorityStateStoreV0(stateDbPath);
    try {
      persistedState = reopened.get(key);
      restartReplay = expectAuthorityError(
        () => reserveTransactionThroughE1V0({
          warrantBodyBytes,
          warrantSignatureBytes,
          trustedWarrantIssuers: trust.trustedIssuers,
          transitionEnvelopeBytes: envelopeBytes,
          transaction: transactionFromProposal(proposal),
          authorityStateStore: reopened,
          expectedDomain: trust.enforcementDomain,
        }),
        "S0_STATE_INVALID"
      );
    } finally {
      reopened.close();
    }
  }
  if (persistedState?.state !== "TX_EXECUTED" || !persistedState.consumedAt) {
    throw new Error("consumed S0 state did not survive restart");
  }

  const result = {
    schema: "workflow-observatory/gate-zero-t0-phase/v0",
    phase,
    attempts: {
      "T0-REPLAY-01": {
        status: "REJECTED_AS_EXPECTED",
        observed_code: firstReplay.code,
        state_before_attempt: "TX_EXECUTED",
        second_protected_consequence: false,
      },
      "T0-REPLAY-02": {
        status: "REJECTED_AS_EXPECTED",
        observed_code: restartReplay.code,
        persisted_state_after_restart: persistedState.state,
        consumed_at_present: true,
      },
    },
  };
  await fs.writeFile(
    path.join(outputDir, "post-e1.json"),
    JSON.stringify(result, null, 2) + "\n"
  );
  console.log(JSON.stringify(result, null, 2));
} else {
  throw new Error("Unsupported --phase: " + phase);
}

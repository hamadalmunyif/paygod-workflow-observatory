#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error("Missing required argument: " + name);
  return value;
}
async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}
async function digest(file) {
  const bytes = await fs.readFile(file);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function pass(condition, message) {
  if (!condition) throw new Error(message);
}
function record(id, evidencePath, evidenceSha256, observed) {
  return {
    attempt_id: id,
    expected_outcome: "REJECTED_AS_EXPECTED",
    observed_outcome: observed,
    classification: "REJECTED_AS_EXPECTED",
    evidence_artifact_path: evidencePath,
    evidence_sha256: evidenceSha256,
    evidence_kind: "runtime_witness",
  };
}

const preflightPath = requiredArg("--client-preflight");
const auditPath = requiredArg("--rpc-audit");
const preE2Path = requiredArg("--pre-e2");
const postE2Path = requiredArg("--post-e2");
const postE1Path = requiredArg("--post-e1");
const clientImagePath = requiredArg("--client-image");
const e1ExecutionPath = requiredArg("--e1-execution");
const outputPath = requiredArg("--output");

const [preflight, preE2, postE2, postE1, auditText, clientImage, e1Execution] =
  await Promise.all([
    readJson(preflightPath),
    readJson(preE2Path),
    readJson(postE2Path),
    readJson(postE1Path),
    fs.readFile(auditPath, "utf8"),
    fs.readFile(clientImagePath, "utf8").then((x) => x.trim()),
    readJson(e1ExecutionPath),
  ]);

const audit = auditText.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const expectedForbidden = new Set([
  "anvil_setBalance",
  "eth_sendTransaction",
  "eth_sign",
  "eth_signTransaction",
  "personal_sign",
]);
for (const method of expectedForbidden) {
  const rows = audit.filter((x) => x.method === method);
  pass(rows.length > 0, "missing R-client audit for " + method);
  pass(rows.every((x) => x.forwarded === false), "forbidden method forwarded: " + method);
}
pass(
  audit.some((x) =>
    x.method === "eth_sendRawTransaction" &&
    x.forwarded === true &&
    x.decision === "forwarded"
  ),
  "raw transaction route was not actually forwarded"
);

pass(preflight.a51_privileged_rpc_rejected === true, "T0-E1-01 failed");
pass(preflight.a52_r_admin_reachable === false, "T0-E1-02 failed");
pass(preflight.a53_node_managed_protected_signing_rejected === true, "T0-E1-03 failed");
pass(
  preflight.a54_alternate_sender_differs_from_protected === true &&
  preflight.a54_alternate_account_receipt_status === "0x0" &&
  preflight.a54_protected_consequence_observed === false &&
  preflight.next_job_id_before === preflight.next_job_id_after,
  "T0-E1-04 failed"
);
pass(
  preflight.t0_client_sensitive_env_absent === true &&
  preflight.t0_client_sensitive_mount_absent === true &&
  preflight.t0_client_sensitive_files_absent === true &&
  preflight.a53_node_managed_protected_signing_rejected === true,
  "T0-E1-05 failed"
);
pass(
  preflight.t0_client_s0_control_interface_exposed === false &&
  preflight.t0_client_sensitive_mount_absent === true &&
  preflight.t0_client_sensitive_files_absent === true,
  "T0-S0-01 failed"
);
pass(preE2.attempts?.["T0-E2-01"]?.status === "REJECTED_AS_EXPECTED", "T0-E2-01 failed");
pass(postE2.attempts?.["T0-E2-02"]?.status === "REJECTED_AS_EXPECTED", "T0-E2-02 failed");
pass(postE1.attempts?.["T0-REPLAY-01"]?.status === "REJECTED_AS_EXPECTED", "T0-REPLAY-01 failed");
pass(postE1.attempts?.["T0-REPLAY-02"]?.status === "REJECTED_AS_EXPECTED", "T0-REPLAY-02 failed");
pass(postE2.attempts?.["T0-REPLAY-03"]?.status === "REJECTED_AS_EXPECTED", "T0-REPLAY-03 failed");
pass(
  preflight.t0_client_trust_control_interface_exposed === false &&
  preE2.attempts?.["T0-CONFIG-01-support"]?.status === "REJECTED_AS_EXPECTED",
  "T0-CONFIG-01 failed"
);
pass(
  preflight.t0_client_enforcer_control_interface_exposed === false &&
  preflight.t0_client_sensitive_mount_absent === true,
  "T0-CONFIG-02 failed"
);

pass(
  e1Execution.status === "TX_EXECUTED" &&
  e1Execution.s0State === "TX_EXECUTED" &&
  e1Execution.signatureReturnedToCaller === false &&
  e1Execution.operationalMetadataSuppliedByCaller === false &&
  e1Execution.providerDelivered === false &&
  e1Execution.payloadReleased === false &&
  e1Execution.acpOrQuiverInteraction === false,
  "positive E1 execution evidence is incomplete"
);

const [preflightSha, auditSha, preE2Sha, postE2Sha, postE1Sha, e1ExecutionSha] =
  await Promise.all([
    digest(preflightPath),
    digest(auditPath),
    digest(preE2Path),
    digest(postE2Path),
    digest(postE1Path),
    digest(e1ExecutionPath),
  ]);

const attempts = [
  record("T0-E1-01", auditPath, auditSha, {
    forbidden_rpc_forwarded: false,
    deterministic_reject: true,
  }),
  record("T0-E1-02", preflightPath, preflightSha, {
    r_admin_reachable_from_c: false,
  }),
  record("T0-E1-03", auditPath, auditSha, {
    protected_node_signing_available: false,
  }),
  record("T0-E1-04", preflightPath, preflightSha, {
    raw_submission_available: true,
    alternate_sender: preflight.a54_alternate_sender,
    protected_sender: preflight.a54_protected_sender,
    alternate_sender_differs: true,
    receipt_status: preflight.a54_alternate_account_receipt_status,
    protected_consequence_observed: false,
    next_job_id_before: preflight.next_job_id_before,
    next_job_id_after: preflight.next_job_id_after,
  }),
  record("T0-E1-05", preflightPath, preflightSha, {
    sensitive_env_exposed: false,
    sensitive_mount_exposed: false,
    sensitive_file_exposed: false,
    equivalent_node_signing_available: false,
  }),
  record("T0-S0-01", preflightPath, preflightSha, {
    s0_file_mounted_to_c: false,
    s0_control_interface_exposed: false,
  }),
  record("T0-E2-01", preE2Path, preE2Sha, preE2.attempts["T0-E2-01"]),
  record("T0-E2-02", postE2Path, postE2Sha, postE2.attempts["T0-E2-02"]),
  record("T0-REPLAY-01", postE1Path, postE1Sha, postE1.attempts["T0-REPLAY-01"]),
  record("T0-REPLAY-02", postE1Path, postE1Sha, postE1.attempts["T0-REPLAY-02"]),
  record("T0-REPLAY-03", postE2Path, postE2Sha, postE2.attempts["T0-REPLAY-03"]),
  record("T0-CONFIG-01", preE2Path, preE2Sha, {
    client_trust_control_interface_exposed: false,
    attacker_trust_support_test: preE2.attempts["T0-CONFIG-01-support"],
  }),
  record("T0-CONFIG-02", preflightPath, preflightSha, {
    enforcer_control_interface_exposed: false,
    writable_sensitive_mount_exposed: false,
  }),
];

const isMainPush =
  process.env.GITHUB_EVENT_NAME === "push" &&
  process.env.GITHUB_REF === "refs/heads/main";

const result = {
  schema: "workflow-observatory/gate-zero-t0-witness/v0",
  result: isMainPush
    ? "NO_BYPASS_OBSERVED_UNDER_T0_E1_PRE_PROVIDER"
    : "CANDIDATE_T0_WITNESS_PASSED_ON_PR",
  witness_status: isMainPush ? "MAIN_PUSH_WITNESS" : "PR_CANDIDATE_ONLY",
  claim: isMainPush
    ? "No bypass was observed under Threat Model T0 across the declared E1 transaction enforcement surface of the controlled local harness."
    : "Candidate T0 attempt set passed on a non-main workflow context; no final Gate Zero witness claim is issued.",
  claim_scope: {
    e1_transaction_surface: "runtime_observed",
    e2_exact_staging_attacks: "runtime_observed_supporting_evidence",
    protected_provider_ingress: "NOT_IMPLEMENTED",
    e2_release: "NOT_IMPLEMENTED",
    provider_observation: "NOT_IMPLEMENTED",
    two_surface_postflight_conformance: "NOT_IMPLEMENTED",
    conditional_release_authority_general_claim: false,
  },
  harness_commit: process.env.GITHUB_SHA ?? "UNKNOWN",
  workflow_run_id: process.env.GITHUB_RUN_ID ?? "UNKNOWN",
  positive_path: {
    status: e1Execution.status,
    s0_state: e1Execution.s0State,
    protected_execution_account: e1Execution.protectedExecutionAccount,
    transaction_hash: e1Execution.transactionHash,
    tx_evidence_sha256: e1Execution.txEvidenceSha256,
    signature_returned_to_caller: e1Execution.signatureReturnedToCaller,
    evidence_artifact_path: e1ExecutionPath,
    evidence_sha256: e1ExecutionSha,
  },
  components: {
    paygod_kernel_commit: "23ea2cca74ef8b698718c6d0c8dbda447f13bb37",
    foundry_version: "v1.8.5",
    foundry_archive_sha256: "6c66ffcc55fa4249197721baa3098bc208014ea1d8aa04b2ed50ac6bccffb226",
    solc_version: "0.8.30+commit.73712a01",
    solc_sha256: "f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7",
    adversarial_client_image: clientImage,
  },
  attempts,
  totals: {
    declared: attempts.length,
    rejected_as_expected: attempts.filter((x) => x.classification === "REJECTED_AS_EXPECTED").length,
    bypass_observed: 0,
    not_testable_under_t0: 0,
    harness_defect: 0,
  },
  explicit_exclusions: [
    "host/root compromise",
    "privileged S0 filesystem rollback or snapshot restore",
    "runner/host OS compromise beneath E1/S0",
    "trusted Warrant issuer key compromise",
    "provider-side E2 bypass and cross-surface conformance",
  ],
  t1_opened: false,
  ap2_pass_b_required_before_new_adapter_or_product_engineering: true,
};

pass(result.totals.rejected_as_expected === result.totals.declared, "not all frozen T0 attempts passed");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));

# Gate Zero — Frozen T0 Attack Manifest v0

Status: **FROZEN BEFORE FINAL T0 WITNESS IMPLEMENTATION**

Purpose: define the minimum attack set that must be executed and recorded before the local controlled harness may be promoted from RPC preflight to a bounded Gate Zero result.

Source threat model:

- `THREAT_MODEL_T0.md`
- `ATTACK_CATALOGUE_V0.md`

This manifest does not widen T0 to host/root compromise.

## 1. Result vocabulary

Every row must end in exactly one of:

- `REJECTED_AS_EXPECTED`
- `BYPASS_OBSERVED`
- `NOT_TESTABLE_UNDER_T0`
- `HARNESS_DEFECT`
- `NOT_TESTED`

No omitted attack may be treated as an implicit pass.

## 2. Frozen E1 / client-boundary set

| Attack | Attempt | Required evidence | Expected result |
|---|---|---|---|
| A51 | C invokes forbidden/admin/signing RPC through R-client | C output + R-client audit proves `forwarded=false` | REJECTED_AS_EXPECTED |
| A52 | C connects directly to R-admin | C network result | REJECTED_AS_EXPECTED |
| A53 / A1 | C requests node-managed or otherwise exposed protected-key signing | C output + R-client audit; no protected signature/transaction | REJECTED_AS_EXPECTED |
| A54 / A2 / A17 | C signs exact target/calldata/value with an alternate key and submits through allowed `eth_sendRawTransaction` | tx readback proves alternate sender != protected sender; receipt fails; protected contract state unchanged | REJECTED_AS_EXPECTED |
| A55 | C supplies protected E1 operational metadata such as nonce/gas/fee/signature | E1 test/result | REJECTED_AS_EXPECTED |
| KEY-REACHABILITY | C inspects its environment and mounted filesystem for protected execution private-key material or a generic protected signing capability | C-boundary inventory/result | REJECTED_AS_EXPECTED |
| S0-REACHABILITY | C inspects its environment/mounted filesystem and declared network surfaces for S0 DB/admin/reset capability | C-boundary inventory/result | REJECTED_AS_EXPECTED |

### KEY-REACHABILITY success condition

The test passes only if all are true:

- protected execution private-key bytes are not present in C;
- no private-key file is mounted into C;
- no environment variable supplies protected private-key material/path;
- no generic signing endpoint exposed to C can sign as the protected account;
- C cannot produce the protected sender identity except through the protected E1 path.

This proves only the frozen C boundary, not resistance to host/root compromise.

### S0-REACHABILITY success condition

The test passes only if all are true:

- `authority-state.db` is not mounted into C;
- no generic SQL/database/admin/reset API is exposed to C;
- no declared C network endpoint provides S0 reset/rollback/write capability;
- the only client-facing RPC boundary remains R-client, which contains no S0 mutation method.

This proves absence of an Agent-accessible reset path in the frozen harness. It does not prove rollback resistance against the runner/host administrator.

## 3. Frozen E2 binding set

| Attack | Attempt | Required evidence | Expected result |
|---|---|---|---|
| A9 | Use the valid issued Warrant/Envelope but change exact payload bytes before E2 staging | workflow/runtime rejection and S0 remains `ISSUED` | REJECTED_AS_EXPECTED |
| A37 | Use exact payload bytes with a different recipient | deterministic E2 rejection | REJECTED_AS_EXPECTED |
| A43 | Stage once then attempt replacement/restaging | state/payload bytes unchanged | REJECTED_AS_EXPECTED |
| A56 | Present a self-authored Warrant trust anchor through a caller-controlled path | no caller path upgrades Warrant issuer trust | REJECTED_AS_EXPECTED or NOT_TESTABLE_UNDER_T0 with explicit boundary |

A9 must be executed in the witness workflow with the same valid Warrant used by the positive path. Unit coverage alone is not sufficient for A9 witness status.

## 4. Frozen replay / state set

| Attack | Attempt | Required evidence | Expected result |
|---|---|---|---|
| A13 | Reuse the same nonce after reservation/consumption | deterministic state rejection | REJECTED_AS_EXPECTED |
| A14 | Race two reservations against the same `issuer_key_id + nonce` | at most one reservation succeeds; final state is single `TX_RESERVED` | REJECTED_AS_EXPECTED |
| A15 | Close/reopen S0 after consumption and replay the same Warrant/action | replay rejected after restart | REJECTED_AS_EXPECTED |
| A16 | Attempt every reset/rollback path exposed to C under this harness | no Agent-accessible reset/rollback path exists or succeeds | REJECTED_AS_EXPECTED |

### A16 boundary

The following are **not** part of A16 under T0:

- runner/root deletes or replaces the SQLite file;
- host administrator restores an old disk snapshot;
- privileged operator mounts an earlier DB copy;
- host compromise reads the protected key or DB directly.

Those belong to a future T1 / host-operator compromise model and are not opened before AP2 Pass B.

## 5. Existing evidence versus witness evidence

The final report must distinguish:

- `UNIT_OR_INTEGRATION_PASS`
- `WORKFLOW_RUNTIME_PASS`
- `C_BOUNDARY_RUNTIME_PASS`

A unit test may support implementation correctness but must not be relabeled as a C-boundary result.

The final Gate Zero result requires runtime evidence for:

- A51;
- A52;
- A53/A1;
- A54/A2/A17;
- KEY-REACHABILITY;
- S0-REACHABILITY;
- A9;
- A15.

A13/A14 may be executed against an isolated S0 fixture in the workflow, provided the fixture uses the same S0 implementation and frozen state semantics.

## 6. Immediate stop rules

Record `BYPASS_OBSERVED` and stop promotion if any of these occurs:

1. C obtains protected private-key material or an equivalent unrestricted protected signing capability.
2. C creates the protected contract consequence outside E1.
3. C can mutate/reset/replace consumed-nonce state through an in-scope C path.
4. E2 accepts changed payload bytes under the valid Warrant.
5. two concurrent reservations succeed for one nonce.
6. consumed authority becomes usable after S0 restart.

Any such result downgrades the tested boundary to:

`Advisor / Evidence Authority`

until the architecture changes and a new frozen witness is run.

## 7. Gate Zero E1 claim ceiling

If every testable E1/client/state item above passes and no bypass is observed, the maximum transaction-surface claim is:

> No bypass was observed under Threat Model T0 across the declared E1 transaction enforcement surface of the local controlled harness.

This is not yet the two-surface Conditional Release claim.

## 8. Two-surface promotion rule

No overall controlled conditional-release result may be stated until later work also completes:

- E2 release only after matching `TX_EXECUTED`;
- controlled provider observation;
- post-flight E1 + E2 conformance;
- payload-surface bypass attempts including A18/A19/A20/A26-A28 where applicable.

## 9. Deliberately deferred

Until AP2 Pass B is reconciled, do not open:

- T1 host/root compromise;
- SQLite snapshot rollback by privileged operator;
- HSM/KMS/MPC migration;
- public/testnet/mainnet execution;
- economic gas/fee authority;
- AP2 adapter;
- x402 adapter;
- product/dashboard expansion.

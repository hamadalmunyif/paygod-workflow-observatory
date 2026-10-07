# Gate Zero — E1 Witness v0

Status: **FROZEN BEFORE WITNESS EXECUTION**

Purpose: record the bounded E1 Gate Zero witness criteria under Threat Model T0.

This document does not claim full two-surface T0 completion.

## 1. Witness question

Can adversarial client C, within the declared T0 boundary, produce the same protected local EVM consequence without traversing the authorized E1 path?

## 2. Required legitimate path

The legitimate control path must reach:

`Evidence -> canonical PayGod ALLOW -> authenticated receipt -> Warrant -> ISSUED -> PAYLOAD_STAGED -> TX_RESERVED -> protected-key local EVM execution -> TX_EXECUTED`

The protected execution private key must remain outside C and outside uploaded evidence artifacts.

## 3. Frozen attack source

Machine-readable attack set:

`contracts/t0-e1-gate-zero-manifest-v0.json`

The witness must not omit a manifest attack merely because it is inconvenient to execute.

## 4. Mandatory live boundary attempts

The witness must include live attempts for:

- A0/A17 — protected consequence without E1 through the raw-transaction path;
- A1/A53 — protected signing through client-visible node-managed signing;
- A2/A54 — alternate signer with exact target/calldata/value;
- A51 — privileged/dev-node RPC through R-client;
- A52 — direct R-admin reachability;
- T0-KEY-REACH — read/write protected execution key from C;
- T0-S0-REACH — read/write S0 from C;
- A22/A49/A56 boundary — read/write configured trust stores from C.

The raw transaction path must remain available. A witness that simply blocks `eth_sendRawTransaction` does not satisfy A0/A17/A54.

## 5. Mandatory runtime authority tests

The witness must preserve runtime evidence for:

- A9 — valid authority with changed E2 payload bytes;
- A13 — reuse after reservation;
- A14 — concurrent double use; at most one reservation may succeed;
- A15 — restart then replay of consumed authority;
- A23 — changed/stale Transition Envelope;
- A55 — caller-supplied operational transaction metadata.

The runtime test output is preserved as a TAP artifact.

## 6. A16 and A21 interpretation

T0 does not give C host-admin or filesystem-admin privileges.

Therefore:

- A16 passes only if no Agent-accessible S0 reset/rollback path is observed under the declared container boundary;
- A21 passes only if no Agent-accessible mechanism to disable/replace E1 or R-client is observed under the declared container boundary.

Privileged host rollback/replacement remains T1 and is not silently counted as a T0 pass.

## 7. Failure rule

Any of the following immediately prevents a Gate Zero E1 witness:

- C can read or use the protected execution private key;
- C can mutate/reset S0;
- C can replace trusted issuer configuration;
- alternate signer produces the protected contract consequence;
- direct R-admin is reachable;
- client-visible signing returns a usable protected signature;
- changed payload/transition is accepted;
- two concurrent uses both reserve successfully;
- consumed authority becomes reusable after restart.

Any successful protected consequence outside the authorized E1 path downgrades the tested architecture to **Advisor / Evidence Authority** for this boundary.

## 8. Pass result

A successful run may emit only:

`NO_BYPASS_OBSERVED_UNDER_T0_E1`

with the claim:

> No bypass was observed under Threat Model T0 across the declared E1 transaction enforcement surface of the local closed harness.

## 9. Explicit non-claims

This witness does not establish:

- full E1+E2 two-surface T0 completion;
- provider payload-release exclusivity;
- globally non-bypassable execution;
- independent production enforcement boundary;
- trusted external time;
- PayGod decision replay;
- economic gas/fee authority;
- T1 host/operator compromise resistance;
- Conditional Release Authority;
- Warrant originality relative to AP2.

## 10. Next boundary

After a successful E1 witness, the next engineering step is limited to:

`TX_EXECUTED -> E2 exact release -> provider observation -> post-flight conformance`

No AP2 adapter, x402 adapter, T1 expansion, dashboard, or product layer is authorized by this witness.

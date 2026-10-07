# Gate Zero — Frozen T0 Attempt Set v0

Status: **FROZEN BEFORE FULL T0 WITNESS IMPLEMENTATION**

Purpose: operationalize Threat Model T0 and Attack Catalogue v0 into a bounded witness plan without expanding into T1 host/operator compromise.

This document does not change the frozen threat model or weaken any existing expected failure.

## 1. Claim target

If all testable attempts below complete without `BYPASS_OBSERVED`, the maximum E1-only claim is:

> No bypass was observed under Threat Model T0 across the declared E1 transaction enforcement surface of the controlled local harness.

This is not yet the full two-surface T0 claim.

The full E1+E2 claim remains unavailable until protected provider ingress, E2 release, provider observation, and post-flight cross-surface conformance are implemented and tested.

## 2. Mandatory downgrade rule

If adversarial client C can obtain either:

- the protected execution private key; or
- any signing/use capability that produces the same protected sender identity outside E1; or
- the same protected contract consequence without the authorized E1 path;

then the tested architecture is classified:

`Advisor / Evidence Authority`

for the tested boundary.

Do not relabel the result as conditional release.

## 3. T0 / T1 boundary

Inside T0:

- C application/container compromise;
- C network access;
- C use of any interface intentionally exposed to it;
- alternate signer/account attempts;
- replay/concurrency;
- payload/transaction substitution;
- Agent-accessible S0 reset/rollback paths;
- Agent-accessible trust/enforcer reconfiguration.

Outside T0 for this witness:

- host/root compromise;
- operator intentionally copying the protected key into C;
- privileged modification/replacement of the S0 database file by the host operator;
- privileged restore of an old S0 filesystem snapshot;
- compromise of the runner/host OS beneath E1/S0;
- compromise of the trusted Warrant issuer key.

Those excluded rollback/host-compromise scenarios belong to a future T1 and must not be opened before the AP2 Pass B decision.

## 4. Frozen attempt set

### T0-E1-01 — privileged RPC through R-client

Maps to: A51.

Attempt:

- call representative Anvil/admin/signing methods through R-client.

Required evidence:

- deterministic local reject;
- audit event for each method;
- `forwarded=false`.

Expected: `REJECTED_AS_EXPECTED`.

### T0-E1-02 — direct R-admin reachability

Maps to: A52.

Attempt:

- C connects directly to host R-admin port 18545.

Expected:

- unreachable from C network namespace.

Expected: `REJECTED_AS_EXPECTED`.

### T0-E1-03 — node-managed protected signing

Maps to: A1 / A53.

Attempt:

- `eth_sendTransaction`;
- `eth_sign`;
- `eth_signTransaction`;
- `personal_sign`;
- equivalent exposed node-managed signing path for the protected account.

Expected:

- no protected signature;
- no protected transaction;
- no forwarding to R-admin.

Expected: `REJECTED_AS_EXPECTED`.

### T0-E1-04 — alternate raw signer/account

Maps to: A0 / A2 / A17 / A54.

Attempt:

- use an independently controlled account;
- build the exact target/calldata/value;
- submit by the intentionally available `eth_sendRawTransaction`.

Required evidence:

- raw path is reachable;
- observed transaction sender differs from protected sender;
- target/calldata match frozen action;
- receipt fails;
- protected consequence does not occur;
- `nextJobId` remains unchanged.

Expected: `REJECTED_AS_EXPECTED`.

### T0-E1-05 — protected-key reachability from C

Maps to: T0 §4, A1, A21.

Attempt:

- record C environment-variable names;
- record C mount topology;
- verify no protected-key file/path/value is passed to C;
- verify no runner-temp or host key directory is mounted into C;
- attempt all supported signing interfaces exposed to C;
- verify C cannot obtain a protected-sender signature or transaction.

This test proves only the declared harness boundary, not universal key secrecy.

Expected: `REJECTED_AS_EXPECTED`.

If protected-key material or equivalent signing capability is exposed, record `BYPASS_OBSERVED` and downgrade to Advisor.

### T0-S0-01 — S0 reachability/mutation from C

Maps to: A16 / A21.

Attempt:

- record C mount topology and environment;
- verify the S0 SQLite file is not mounted into C;
- verify no S0 SQL/admin/reset endpoint is routable/exposed to C;
- attempt any S0 interface that is intentionally exposed to C.

Expected:

- no Agent-accessible mutation/reset path.

Expected: `REJECTED_AS_EXPECTED`.

Privileged host filesystem modification is outside T0 and must not be silently counted as this test.

### T0-E2-01 — valid Warrant, changed payload bytes

Maps to: A9.

Attempt:

- use the legitimate signed Warrant and exact Transition Envelope;
- submit modified payload bytes through E2 before the legitimate stage.

Required evidence:

- `E2_PAYLOAD_DIGEST_MISMATCH`;
- S0 remains `ISSUED`;
- no staged replacement bytes exist.

Expected: `REJECTED_AS_EXPECTED`.

### T0-E2-02 — staged-payload replacement

Maps to: A43.

Attempt:

- after successful staging, attempt to stage again or replace exact stored payload bytes.

Expected:

- reject;
- original staged bytes remain byte-identical.

Expected: `REJECTED_AS_EXPECTED`.

### T0-REPLAY-01 — replay after successful consumption

Maps to: A13.

Attempt:

- after authority reaches at least `TX_RESERVED`, present the same Warrant/nonce again.

Expected:

- reject with no second protected consequence.

Expected: `REJECTED_AS_EXPECTED`.

### T0-REPLAY-02 — restart then replay

Maps to: A15.

Attempt:

- close/reopen the S0 authority-state implementation;
- present the already-consumed Warrant/nonce again.

Required evidence:

- consumed state persists;
- replay is rejected.

Expected: `REJECTED_AS_EXPECTED`.

### T0-REPLAY-03 — concurrent double use

Maps to: A14.

Attempt:

- two independent E1 reservation processes/contexts race the same `issuer_key_id + nonce` against the same durable S0 instance.

Required evidence:

- at most one transition reaches `TX_RESERVED`;
- the other receives a deterministic rejection;
- one nonce cannot produce two protected transaction authorizations.

Expected: `REJECTED_AS_EXPECTED`.

### T0-CONFIG-01 — Warrant trust substitution

Maps to: A22 / A56.

Attempt:

- C supplies or substitutes an attacker-authored Warrant issuer trust object.

Expected:

- E1/E2 use only the preconfigured harness trust anchor;
- caller-supplied trust cannot upgrade an issuer.

Expected: `REJECTED_AS_EXPECTED`.

### T0-CONFIG-02 — enforcer replacement/reconfiguration

Maps to: A21.

Attempt:

- inspect the C runtime boundary for any supported writable path or control API that can replace/reconfigure E1, E2, R-client, or their trust configuration.

Expected:

- no such C-accessible control path exists.

Expected: `REJECTED_AS_EXPECTED`.

Host/root replacement remains outside T0.

## 5. Already supported by current code/tests

Before this witness implementation, the repository already contains supporting tests for:

- A9 changed payload rejection;
- A13 replay after reservation;
- A15 persistence/replay after S0 restart;
- A43 staged payload replacement rejection;
- A51–A55 E1 RPC/alternate-signer preflight;
- A56 external Warrant trust requirement at E1/E2 boundary.

These existing tests are supporting evidence only.

The final T0 witness must explicitly record which attempts were run in the witness and which rely on supporting test evidence.

## 6. Not yet claimable

The following remain unavailable in the current slice:

- A18 provider-side E2 bypass;
- A19 transaction succeeds while E2 fails, with final cross-surface classification;
- A20 E2 succeeds while E1 fails, with final cross-surface classification;
- A26–A28 protected provider/job-correlation attacks;
- A41 payload release before matching transaction evidence as a live provider boundary;
- final post-flight two-surface conformance.

Until these are implemented, the result must remain E1-bounded or pre-provider.

## 7. Result record

For every attempt record:

- attack/attempt id;
- exact harness commit;
- exact workflow run id;
- component/image/tool digests;
- expected outcome;
- observed outcome;
- `REJECTED_AS_EXPECTED | BYPASS_OBSERVED | NOT_TESTABLE_UNDER_T0 | HARNESS_DEFECT`;
- evidence artifact path/digest;
- whether the result is runtime witness evidence or supporting unit-test evidence.

No unexecuted attack may be silently counted as passed.

## 8. Stop rule

Stop the witness immediately on any:

- `BYPASS_OBSERVED`;
- protected-key exposure;
- equivalent protected signing path outside E1;
- C-accessible S0 reset/mutation path;
- two successful consumptions of one Warrant nonce.

Do not continue remaining attacks merely to produce a complete-looking matrix.

## 9. Product / prior-art boundary

Passing this attempt set does not authorize:

- AP2 adapter work;
- x402 adapter work;
- product/dashboard expansion;
- originality claims for Warrant;
- Conditional Release Authority as a general claim.

AP2 Pass B remains the prior-art decision gate.

T1 remains `WATCH`.

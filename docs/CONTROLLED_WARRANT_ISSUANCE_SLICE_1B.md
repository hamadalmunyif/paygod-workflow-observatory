# Controlled Warrant Issuance — Slice 1b

Status: **IMPLEMENTATION CANDIDATE — NO ENFORCEMENT OR EXECUTION**

Purpose: test whether one authenticated canonical local PayGod ALLOW decision can be transformed into one minimal Warrant v0 and registered in S0 without exposing E1/E2 or any transaction path.

## 1. Trusted bridge rule

The runtime issuance path must not accept a caller-supplied `paygodVerification` JSON object as authority.

The bridge itself invokes the pinned PayGod standalone verifier against:

- the PayGod decision bundle;
- the external controlled D trust store;
- `--require-issuer-authenticity`.

Only the verifier result produced inside that bridge invocation may enter the semantic D→I admission checks.

This preserves:

`producer claim != verifier-derived trust`

at the D→I boundary.

## 2. Positive slice

The Slice 1b positive path is:

```text
exact Release Candidate
        ↓
canonical PayGod decision
        ↓
signed PayGod receipt
        ↓
standalone verifier + external D trust store
        ↓
AUTHENTICATED_CANONICAL_ALLOW
        ↓
Warrant issuer key (distinct trust role)
        ↓
exact Warrant v0
        ↓
S0 ISSUED registration
```

The Warrant is returned only after S0 registration succeeds.

## 3. Negative coverage in this slice

The integration workflow exercises with the established PayGod verifier:

- A44 — unsigned PayGod decision receipt;
- A45 — untrusted decision signer;
- A46 — receipt mutation after signing.

Semantic/unit tests exercise:

- A47 — candidate/receipt canonical input mismatch;
- A48 — wrong authenticated pack/verdict contract;
- A29/A30 — no eligible ALLOW / denied decision;
- A31 — request substitution;
- A32 — transition substitution;
- A33 — wrong enforcement domain;
- A35 — duplicate nonce issuance.

## 4. A49 / A50 boundary

A49 (client trust-store substitution) and A50 (D signing-oracle bypass) are **not promoted to passed** by Slice 1b.

Reason:

- Slice 1b has no adversarial client runtime/process;
- the D trust store and D signing command exist only inside the controlled CI/runtime boundary.

They remain mandatory Gate Zero/boundary tests once C/I are instantiated as separate harness components.

## 5. Deliberate limitations

Slice 1b performs none of:

- E2 payload staging;
- E1 transaction reservation;
- signing with an execution key;
- EVM transaction submission;
- provider payload delivery;
- ACP authentication;
- ACP Agent/Signer/Job creation;
- Quiver interaction;
- Base mainnet/testnet access;
- decision replay.

Decision replay remains exactly:

`not_performed`

and must remain visible in all issuance evidence.

## 6. Success criterion

Slice 1b succeeds only when:

- canonical Release Candidate binding is verified;
- PayGod bundle integrity is verified;
- PayGod receipt issuer authenticity is verified;
- allowed pack/verdict/rule contract is exact;
- request/attempt/transition bindings remain exact;
- D signer key and Warrant issuer key are distinct roles;
- Warrant v0 exact bytes/signature are produced;
- S0 returns `ISSUED`;
- duplicate nonce issuance fails;
- no E1/E2/external transition occurs.

## 7. Claim ceiling

A successful Slice 1b supports only:

> An authenticated canonical local PayGod ALLOW decision was converted into one signed local Warrant v0 and durably registered as ISSUED in S0 under the controlled harness boundary.

It does not support:

- Conditional Release Authority;
- non-bypassability;
- transaction enforcement;
- payload enforcement;
- Execution Integrity Infrastructure;
- third-party acceptance;
- external-system portability.

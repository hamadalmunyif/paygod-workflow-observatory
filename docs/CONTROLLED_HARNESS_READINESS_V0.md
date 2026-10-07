# Controlled Harness Readiness Decision v0

Status: **READY FOR LOCAL IMPLEMENTATION ONLY**

This decision reviews the frozen authority/harness specifications after the final pre-implementation corrections.

It does not authorize live ACP execution or any third-party interaction.

## 1. Reviewed contracts

The readiness decision is based on:

- `THREAT_MODEL_T0.md`
- `ATTACK_CATALOGUE_V0.md`
- `TRANSITION_ENVELOPE_V0.md`
- `WARRANT_V0.md`
- `CONTROLLED_HARNESS_ARCHITECTURE_V0.md`
- `AUTHORITY_STATE_V0.md`
- `WARRANT_ISSUANCE_V0.md`
- `POSTFLIGHT_EVIDENCE_V0.md`
- `CONTROLLED_HARNESS_BOUNDARY_V0.md`
- `CONTROLLED_HARNESS_IMPLEMENTATION_PROFILE_V0.md`

## 2. Pre-implementation gaps now closed

### Transition actor binding

The transaction surface now commits the exact `execution_account`.

This prevents target/calldata/value alone from ambiguously representing authority exercised by different accounts.

### Payload recipient binding

The payload surface now commits `payload.recipient`.

The same bytes delivered to a different provider identity are not the same protected transition.

### Issuer is not an open mint

Warrant issuance is bound to an eligible canonical PayGod decision and a matching frozen request/transition.

Issuer-path attacks A29-A34 are frozen before implementation.

### Duplicate issuance / nonce identity

S0 registration is part of issuance.

A Warrant is returned only after unique `issuer_key_id + nonce` registration succeeds.

Attack A35 is frozen.

### Replay state location

S0 owns durable SQLite-backed nonce/state semantics for the reference harness.

The nonce becomes irrevocably consumed at `PAYLOAD_STAGED -> TX_RESERVED`.

### Cryptographic profile

The controlled Warrant issuer profile is frozen to Ed25519.

`issuer_key_id` is derived from SHA-256 of exact DER SPKI public-key bytes.

### Time boundary

S0 local wall clock is the single harness time reference.

It is explicitly classified as `HARNESS_LOCAL_WALL_CLOCK`, not trusted external time.

### Local-only execution environment

The first harness targets a local EVM-compatible chain with chain id 31337.

No public chain or ACP system is authorized.

## 3. Remaining limitations are explicit, not implementation blockers

The following remain intentionally outside the local v0 claim:

- hardware key isolation;
- host/root compromise;
- production issuer rotation/revocation;
- trusted external time;
- third-party wallet enforcement;
- ACP-native payload enforcement;
- third-party provider acceptance;
- economic liability;
- cross-system portability;
- Witness 006-level independent verification.

These limitations narrow the claim but do not block a local falsification harness.

## 4. Implementation authorization

The repository may now implement a **local-only controlled harness** subject to all of the following:

1. no ACP authentication;
2. no ACP Agent creation;
3. no ACP signer registration;
4. no ACP Job creation;
5. no Base mainnet or testnet transaction;
6. no Quiver/provider interaction;
7. no real-value funding;
8. no external wallet use;
9. no generic signing API exposed to the adversarial client;
10. all frozen attack cases remain unchanged unless a documented harness defect is proven;
11. any new dependency or local-devchain tool is pinned in the implementation PR;
12. implementation failure may narrow the design; expected failures may not be rewritten merely to make the harness pass.

## 5. First implementation slice

The first code slice should implement only the authority core:

- exact Transition Envelope byte profile;
- transition commitment;
- Ed25519 issuer key/id/signature profile;
- Warrant body exact-byte profile;
- trusted-issuer verification;
- S0 issuance registration;
- nonce/state transitions;
- expiry/domain checks;
- tests for issuance and replay semantics.

This slice must not yet submit even a local EVM transaction.

The purpose is to falsify the authority object/state semantics before E1/E2 execution code exists.

## 6. Second implementation slice

Only after the authority core passes its adversarial tests may the repository implement:

- E2 payload staging;
- E1 local-EVM transaction enforcement;
- controlled provider release;
- post-flight evidence/conformance.

## 7. Claim ceiling during implementation

Before the complete controlled harness and frozen attack catalogue pass, the project must not claim:

- Conditional Release Authority;
- non-bypassability;
- Execution Integrity Infrastructure.

During Slice 1 the valid description is:

> local authority-object and replay-state semantics under adversarial test.

## 8. Decision

`BUILD_LOCAL_SLICE_1`

with all external/live paths remaining rejected or unauthorized.


## 9. Post-Slice-1 decision

Authority Core v0 Slice 1 has been implemented and hardened.

Before Slice 2 E1/E2 enforcement, the repository must implement the semantic bridge defined by `RELEASE_DECISION_CONTRACT_V0.md`.

Authorized next slice:

`BUILD_RELEASE_DECISION_BINDING_V0`

Scope:

- Release Candidate v0 exact artifact;
- dedicated local-only D2 release pack;
- Kernel-owned canonical-hash checks for D1/D2 inputs;
- D1/D2/cross-artifact linkage verification;
- issuer precondition logic;
- adversarial tests A42-A55.

Still not authorized in this slice:

- E1 transaction submission;
- E2 provider release;
- local EVM transaction;
- ACP or any third-party action.

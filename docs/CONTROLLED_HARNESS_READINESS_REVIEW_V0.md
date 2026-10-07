# Controlled Harness Readiness Review v0

Status: **REVIEW COMPLETE**

Reviewed against:

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

## 1. Review question

Is the design specific enough that a local-only harness can now be implemented without silently inventing authority semantics during coding?

Answer:

**YES — for a local controlled harness only.**

This is not authorization for ACP, Quiver, testnet, mainnet, funded wallets, or third-party providers.

## 2. Material defects found during review

### R1 — execution account was not committed

Earlier Transition Envelope v0 bound chain, target, calldata, and value but not the account whose authority was being exercised.

Correction:

- added `transaction.execution_account`;
- E1 must verify it;
- attack catalogue includes execution-account substitution.

Status: **CLOSED BEFORE IMPLEMENTATION**

### R2 — payload recipient was not committed

Earlier payload binding committed bytes/content type but not the intended authoritative recipient.

Correction:

- added `payload.recipient`;
- E2/P must verify it;
- attack catalogue includes recipient substitution.

Status: **CLOSED BEFORE IMPLEMENTATION**

### R3 — nonce consumption role was ambiguous

Earlier Warrant v0 language could be read as requiring every verifier to consume the nonce.

Correction:

- E2 stages but does not consume;
- E1 is the designated consuming enforcer;
- consumption occurs atomically at `PAYLOAD_STAGED -> TX_RESERVED`.

Status: **CLOSED BEFORE IMPLEMENTATION**

### R4 — signed-but-unregistered warrants were underspecified

A detached signature alone could otherwise look sufficient even when S0 had never registered the authority state.

Correction:

- issuance now requires successful S0 `ISSUED` registration;
- S0 binds exact warrant-body digest and validity fields;
- E1/E2 reject absent or mismatched S0 registration;
- attacks A38/A39 freeze this behavior.

Status: **CLOSED BEFORE IMPLEMENTATION**

### R5 — issuer crypto/profile was not pinned

Correction:

- Ed25519;
- issuer identity derived from DER SPKI bytes;
- exact Warrant body byte profile frozen;
- exact Transition Envelope byte profile frozen;
- fixed local enforcement domain.

Status: **CLOSED BEFORE IMPLEMENTATION**

### R6 — runtime target was too easy to confuse with ACP

Correction:

- first implementation is local-only;
- chain id 31337;
- controlled ACP-like surrogate contract;
- no ACP/Quiver/testnet/mainnet connectivity;
- result cannot be generalized to ACP.

Status: **CLOSED BEFORE IMPLEMENTATION**

## 3. Remaining assumptions, not defects

The local harness still assumes:

- host/root operator is outside T0;
- issuer private-key compromise is outside T0 and destroys the issuer epoch;
- local wall clock is not trusted external time;
- SQLite persistence is not HSM-grade rollback resistance;
- controlled provider enforcement is not evidence of third-party provider enforcement;
- local EVM behavior is not evidence of ACP-native semantics.

These assumptions are visible and bound the final claim.

## 4. Implementation authorization

The following work is now authorized:

**LOCAL-ONLY CONTROLLED HARNESS IMPLEMENTATION**

Permitted implementation scope:

- local surrogate EVM contract;
- local chain only;
- controlled client/adversary;
- canonical PayGod decision adapter;
- controlled Warrant issuer;
- S0 durable state store;
- E2 payload staging/release gate;
- E1 protected local transaction gate;
- controlled provider worker;
- post-flight evidence generator;
- closed-harness verifier;
- frozen attacks A0-A43.

## 5. Still prohibited

This authorization does not permit:

- ACP Agent creation;
- ACP Signer creation/registration;
- ACP Job creation;
- Quiver interaction;
- Base mainnet or Base Sepolia;
- third-party wallet signing;
- funded wallet use;
- economic transfer;
- external provider notification;
- claim of Conditional Release Authority outside the closed harness;
- claim of Execution Integrity Infrastructure.

## 6. Implementation success criterion

Implementation is not successful because the happy path runs.

Success requires:

- baseline authorized transition reaches `AUTHORIZED_CONFORMANT`;
- all testable frozen attacks have explicit outcomes;
- no `BYPASS_OBSERVED`;
- harness defects are reported as `HARNESS_DEFECT`, not passes;
- restart replay test passes within the declared S0 boundary;
- E1/E2 both enforce the same transition commitment;
- post-flight evidence distinguishes partial/nonconformant outcomes.

## 7. Stop conditions

Implementation must stop and return to design if:

- a required behavior cannot be implemented without weakening a frozen expected attack result;
- E1 or E2 must understand PayGod evidence/policy rather than the minimal authority contract;
- the client must be given generic signing capability;
- the provider must trust unverified client bytes;
- replay protection requires silently expanding T0;
- the surrogate rail has to be modified merely to make the authority claim pass.

## 8. Claim ceiling after a passing local harness

Maximum claim:

> Controlled conditional release was runtime-observed under Threat Model T0 across the declared transaction and payload enforcement surfaces of the local closed harness.

Nothing in this review authorizes a broader claim.

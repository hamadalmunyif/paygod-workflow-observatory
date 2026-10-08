# Authority Preflight — Threat Model T0

Status: **FROZEN FOR CONTROLLED-HARNESS DESIGN**

This document defines the attacker model for the first controlled authority experiment.

It does **not** claim global non-bypassability.

The strongest result this threat model can support is:

> No bypass was observed under Threat Model T0 across the declared enforcement surfaces.

Any stronger statement is out of scope.

## 1. Scope

T0 applies only to a future controlled two-party harness in which both client and provider are operated for the experiment.

It does not apply to Quiver, production ACP providers, arbitrary wallets, or arbitrary smart-account deployments.

Witness 003-LIVE against Quiver remains **REJECTED in its current form**.

No Agent, Signer, Job, funding, signing, or transaction execution is authorized by this document.

## 2. Protected transition

For the ACP case studied in Witness 003-PREFLIGHT, one consequential transition spans at least two independent channels:

1. **Transaction channel**
   - EVM chain
   - ACP contract target
   - exact calldata bytes
   - native value
   - resulting on-chain job identity

2. **Payload channel**
   - ACP authenticated REST message
   - exact requirement payload bytes
   - content type
   - chain/job correlation

A successful authority claim must cover both declared surfaces.

Protecting only the transaction channel is insufficient.

Protecting only the payload channel is insufficient.

## 3. Adversary

The adversary is the client-side Agent or arbitrary code acting with the Agent's application-level privileges.

Within T0 the adversary MAY:

- execute arbitrary application code in its own process;
- alter the proposed request before release;
- alter transaction parameters after release;
- alter payload bytes after release;
- replay previously observed warrants;
- replay previously observed requests;
- substitute a different request for an approved action;
- substitute a different action for an approved request;
- invoke any signer/enforcement API intentionally exposed to the Agent;
- invoke ACP CLI/SDK functions available to the Agent;
- make network requests;
- attempt direct RPC access;
- attempt direct ACP backend/API access;
- attempt to use an alternate application code path;
- retain old artifacts and old warrants;
- race two uses of the same warrant;
- attempt execution after expiry;
- attempt execution before not-before;
- present warrants from an untrusted issuer;
- attempt to bypass either declared enforcement surface independently.

## 4. Capabilities that MUST NOT be silently assumed absent

The harness must explicitly determine whether the Agent has any of the following:

- access to private signing key material;
- key export capability;
- unrestricted signing endpoint;
- alternate signer;
- alternate wallet/account capable of the same transition;
- alternate RPC route that bypasses the enforcement root;
- ability to modify or replace the enforcement module;
- ability to reset or roll back consumed-nonce state;
- ability to modify the trusted issuer-key set;
- ability to invoke the provider-side payload acceptance path without validation.

If any such path exists inside the declared system boundary, it is a bypass candidate and must be tested or explicitly moved outside T0.

## 5. Explicit T0 exclusions

T0 does not attempt to prove resistance to:

- physical compromise of an HSM or secure element;
- compromise of the host operating system beneath an enforcement root unless the harness explicitly models it;
- cryptographic break of the signature algorithm;
- compromise of the trusted PayGod issuer private key;
- compromise of the blockchain consensus layer;
- compromise of ACP infrastructure outside the surfaces explicitly observed;
- coercion or legal compromise of operators.

These are trust assumptions, not proven negatives.

A trusted issuer-key compromise is treated as **total authority compromise for that issuer epoch**.

### T0-I — issuer integrity assumption

T0 explicitly assumes that the Warrant issuer process `I` and its active signing key are not compromised during the witness epoch.

This is a trust assumption, not a tested negative.

If T0-I fails, a cryptographically valid Warrant can potentially be minted without an authenticated PayGod decision. Warrant v0 does not directly commit the exact decision receipt or release-candidate identity, so E1/E2 cannot determine from the Warrant body alone whether canonical decision admission actually occurred.

The local issuance audit and post-flight verifier can expose missing or inconsistent decision lineage after the fact, but they are not a substitute for pre-execution issuer integrity.

T0 therefore does not claim resistance to:

- compromise of the Warrant issuer process;
- use of the Warrant issuer signing key outside the canonical issuance path;
- operator/root compromise that can replace issuer code or key material.

Any future threat model that moves these conditions inside scope must add a separately enforceable issuer-control mechanism rather than treating the current audit trail as preventive authority.

## 6. Trust roots

T0 identifies the following trust roots:

- the PayGod warrant issuer key and the integrity of the Warrant issuer process for the active issuer epoch;
- the enforcement root that validates the transaction surface;
- the enforcement root that validates the payload surface;
- the consumed-nonce state used for single-use semantics;
- the configuration that defines trusted issuer keys;
- the artifact bytes used to derive the frozen transition commitment.

Each trust root must be named in the harness before execution.

## 7. Enforcement surfaces

T0 declares two mandatory surfaces for the ACP controlled harness.

### E1 — Transaction enforcement

E1 must verify that the transaction it is asked to authorize matches the frozen transition commitment.

At minimum E1 must bind:

- chain/system identity;
- target contract;
- exact calldata bytes;
- native value.

E1 must reject a transaction whose action bytes differ from the released transition.

### E2 — Payload enforcement

E2 must verify that the requirement payload accepted for the job matches the same frozen transition commitment.

At minimum E2 must bind:

- exact payload bytes;
- expected content type;
- the remote job/transition context needed by the controlled provider.

E2 must reject a payload whose bytes differ from the released transition.

E2 is an independent bypass surface from E1.

## 8. Replay state

Warrant v0 is single-use by semantics.

Single-use is not achieved by a signature alone.

At least one enforcement component must perform an atomic:

`check nonce unused -> consume nonce -> authorize`

operation.

The harness must document:

- where consumed nonces are stored;
- who can mutate that state;
- who can reset or roll it back;
- whether concurrent consumption is atomic;
- how state survives process restart.

Rollback or reset of the nonce store is an explicit attack surface.

## 9. Issuer authenticity

A verifier must not infer issuer authenticity merely because a signature is mathematically valid.

The verifier must resolve `issuer_key_id` against an explicit trusted-key configuration.

T0 requires rejection of:

- unknown issuer;
- wrong issuer key;
- invalid signature.

Full production-grade key rotation and revocation infrastructure is outside T0.

A verifier test is valid only against the frozen trusted-issuer configuration. Generating a new Warrant key and then constructing a new local trust set that trusts that same key does not demonstrate an untrusted-issuer bypass; it replaces the trust root under test.

Similarly, a direct call to an internal issuance helper with caller-authored verifier metadata is not equivalent to the canonical issuer process unless adversarial client C can reach that helper while the active trusted issuer key remains available. If such a reachable path exists, it becomes an in-scope signer/API bypass candidate under Sections 3–4.

The limitation must remain visible in all conclusions.

## 10. Claim boundary

Passing the future T0 harness may support only:

> Controlled conditional release was runtime-observed under Threat Model T0 across declared enforcement surfaces E1 and E2.

It must NOT be promoted to:

- globally non-bypassable;
- Conditional Release Authority in arbitrary systems;
- Execution Integrity Infrastructure;
- proof that ACP itself enforces PayGod;
- proof that external wallets accept PayGod authority;
- proof that an Agent cannot bypass systems outside T0.

## 11. Immediate falsifiers

The controlled-authority hypothesis fails under T0 if any of the following is observed:

- the Agent can produce the same consequential transition without a valid warrant;
- the Agent can obtain a usable signature through an alternate path;
- E1 accepts changed transaction bytes;
- E2 accepts changed payload bytes;
- one valid warrant can authorize two transitions;
- consumed-nonce state can be reset by the Agent within T0;
- an untrusted issuer can produce an accepted warrant;
- the Agent can replace or disable an enforcement component within T0.

Any one of these is sufficient to classify the system as **Advisor / Evidence Authority** for the tested boundary.

## 12. Freeze rule

The attack catalogue derived from T0 must be frozen before implementation of the controlled harness begins.

New attacks discovered later may be added, but existing expected failures must not be weakened merely to make the harness pass.

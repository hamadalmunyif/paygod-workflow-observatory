# Controlled Harness Architecture v0

Status: **DESIGN FROZEN — NO LIVE EXECUTION AUTHORIZED**

Purpose: define the first controlled two-party harness architecture before implementation.

This harness is a **closed-loop falsification environment**. It is not evidence that ACP, Quiver, arbitrary wallets, or arbitrary smart accounts enforce PayGod.

## 1. Claim ceiling

If the future harness passes, the strongest permitted statement is:

> Controlled conditional release was runtime-observed under Threat Model T0 across the declared enforcement surfaces of the closed harness.

It must not be generalized beyond the tested boundary without a separate external-system witness.

## 2. Parties

### C — Controlled client

The client is an Agent or adversarial client process that proposes a request and attempts execution.

The client:

- does not hold the execution private key;
- does not receive a generic signing primitive;
- may attempt direct network/RPC/API access as allowed by T0;
- may mutate request, transaction, payload, or artifacts;
- may attempt every frozen attack in ATTACK_CATALOGUE_V0.md.

The statement "does not hold the key" is a harness configuration fact, not a universal security claim.

### P — Controlled provider

The provider is operated by the experiment.

Its purpose is to expose a second enforcement surface for the payload channel.

Because P is code operated by us, successful E2 enforcement proves only that the split-channel design can be enforced in the closed harness. It does **not** prove that ACP providers, Quiver, or unrelated external providers perform equivalent enforcement.

## 3. Components

The harness has five logical components:

1. **PayGod decision/issuer**
2. **Authority State Store S0**
3. **E2 payload gate**
4. **E1 transaction gate**
5. **Controlled provider worker**

### 3.1 PayGod decision/issuer

Produces a Warrant v0 over one Transition Envelope v0.

The issuer does not execute the transition.

The issuer key is distinct from the execution key.

### 3.2 Authority State Store S0

S0 is a durable state machine for one warrant nonce and transition commitment.

S0 is outside the client process and is not writable through a generic client API.

S0 exists because single-use semantics and multi-surface sequencing cannot be proven by stateless signature validation.

### 3.3 E2 payload gate

E2 verifies the payload surface against the same transition commitment.

E2 receives the exact proposed payload bytes and Warrant v0.

E2 does **not** immediately expose the payload to the provider worker.

Instead it stages the exact bytes after successful verification.

### 3.4 E1 transaction gate

E1 owns the execution key for the controlled account.

E1 exposes no generic "sign arbitrary bytes" operation to C.

Its protected operation accepts only:

- exact transaction proposal;
- exact Transition Envelope bytes;
- exact Warrant body/signature;
- transition state reference.

E1 verifies and submits the authorized transaction itself.

It returns execution evidence such as transaction hash, not reusable signing material.

### 3.5 Controlled provider worker

The provider worker cannot obtain the staged requirement directly from C.

It receives the payload only after E2 releases the staged bytes following successful transaction evidence.

This separation is required so that "payload accepted by provider" is not equivalent to "client managed to POST bytes somewhere."

## 4. Why E2 is staged before E1

The ACP source study exposed two channels:

- transaction first;
- requirement message second.

A simple sequence can produce partial external state.

If E1 creates an on-chain job and E2 later rejects the payload, the job cannot be erased.

Therefore v0 uses a staged two-surface sequence:

```text
request + proposed action
        |
        v
PayGod decision
        |
        v
Transition Envelope + Warrant
        |
        v
E2 verifies payload
        |
        v
PAYLOAD_STAGED
        |
        v
E1 verifies transaction
        |
        v
TX_EXECUTED
        |
        v
post-flight tx evidence
        |
        v
E2 binds receipt/job context
        |
        v
PAYLOAD_RELEASED
        |
        v
provider worker sees payload
```

This is not atomic cross-system execution.

It is a fail-closed staging protocol intended to make partial failure visible.

## 5. Authority state machine

S0 tracks one tuple:

`issuer_key_id + nonce + transition_commitment`

Allowed states:

- `ISSUED`
- `PAYLOAD_STAGED`
- `TX_RESERVED`
- `TX_EXECUTED`
- `PAYLOAD_RELEASED`
- `CONFORMANT`

Failure/terminal states:

- `REJECTED`
- `EXPIRED`
- `PARTIAL_TX_ONLY`
- `NONCONFORMANT`

The exact storage implementation is not chosen by this document.

The implementation must support atomic state transitions and durable replay protection across process restart for any claim that includes restart persistence.

## 6. E2 verification contract

Before moving S0 from `ISSUED` to `PAYLOAD_STAGED`, E2 must verify:

- trusted issuer key;
- detached signature over exact Warrant body bytes;
- enforcement domain;
- time validity under the declared time source;
- exact Transition Envelope digest;
- exact payload digest;
- exact expected content type;
- nonce not terminally consumed;
- state transition is currently legal.

E2 stores the exact staged payload bytes or an immutable reference to them.

The client must not be able to replace staged bytes without producing a new transition commitment and warrant.

## 7. E1 verification contract

Before moving from `PAYLOAD_STAGED` toward execution, E1 must verify:

- all Warrant validity conditions;
- same transition commitment as the staged payload;
- exact chain/system;
- exact execution account;
- exact target;
- exact calldata bytes;
- exact native value;
- legal S0 state;
- nonce not consumed by another transition.

E1 then performs the signing/submission internally.

A generic signature must not be returned to C.

## 8. Post-transaction binding

After E1 obtains transaction evidence, the harness must derive:

- transaction hash;
- receipt;
- block identifier;
- emitted job/instance identifier when applicable.

The post-flight binder checks that the receipt corresponds to the transaction bytes committed in the Transition Envelope.

Only then may E2 associate the staged payload with the resulting remote instance and release it to the provider worker.

The job/instance identifier is therefore **post-flight evidence**, not silently predicted preflight unless the rail supplies a deterministic precomputable identifier.

## 9. Partial failure

A critical expected failure mode is:

`TX_EXECUTED` but `PAYLOAD_RELEASED` never occurs.

This is classified:

`PARTIAL_TX_ONLY`

It is not equivalent to a successful authorized transition.

The on-chain transaction may remain irreversible.

The harness must preserve this state as evidence rather than hiding it through cleanup.

## 10. Gate Zero interpretation

Gate Zero asks:

> Can C produce the protected consequential transition without traversing the declared E1/E2 enforcement path under T0?

The test includes attempts to:

- access the execution key;
- call a generic signer;
- use alternate signing endpoints;
- submit through direct RPC;
- bypass E2;
- inject payload directly into the provider worker;
- replace trusted issuer configuration;
- reset S0.

A successful bypass ends the authority claim for T0.

## 11. Closed-harness limitation

Because E1, E2, S0, and P are operated by us, a passing harness establishes only:

- the architecture is implementable;
- the frozen attack catalogue did not find a bypass under T0;
- transaction and payload surfaces can be tied to one transition commitment in this controlled environment.

It does not establish:

- ACP-native enforcement;
- third-party wallet acceptance;
- third-party provider acceptance;
- commercial portability;
- independent external authority.

Those require later witnesses.

## 12. Implementation gate

Implementation is not authorized merely because this architecture exists.

Before code is written, the repository must also freeze:

- S0 nonce/state semantics;
- issuer trust configuration;
- post-flight evidence bundle;
- exact harness network/process boundary.

Only after those artifacts are reviewed may a separate implementation decision be made.

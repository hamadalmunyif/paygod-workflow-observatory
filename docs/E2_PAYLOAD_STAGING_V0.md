# E2 Payload Staging v0

Status: **IMPLEMENTATION SLICE — ENDS AT PAYLOAD_STAGED**

Purpose: verify that the controlled harness can accept and durably stage the exact payload bytes bound by one already-issued Warrant v0 without executing E1 or delivering anything to the provider.

## 1. Entry condition

E2 starts only after Slice 1b has produced:

- an authenticated canonical local PayGod ALLOW decision;
- one Warrant v0;
- durable S0 state = `ISSUED`;
- an external Warrant issuer trust store that existed before issuance.

E2 does not create or modify the trusted issuer set.

## 2. Exact inputs

E2 receives:

- exact `warrant-body.json` bytes;
- exact `warrant.sig` bytes;
- preconfigured external Warrant issuer trust-store bytes;
- exact `transition-envelope.json` bytes;
- exact frozen request payload bytes;
- actual payload channel;
- actual payload recipient;
- actual payload content type;
- constrained S0 access.

The request payload for the reference witness is read directly from:

`request-identity.artifacts/request-payload.json`

It is not reconstructed from parsed JSON.

## 3. Warrant trust

The external trust store is parsed under:

`workflow-observatory/warrant-issuer-trust/v0`

E2 re-derives each trusted `issuer_key_id` from exact Ed25519 DER SPKI bytes.

A Warrant-provided, client-provided, or self-authored trust file does not create trust.

The reference witness uses the trust store created during harness-epoch setup before Warrant issuance.

## 4. Verification sequence

Before staging, E2 verifies:

1. exact Transition Envelope byte profile;
2. exact Warrant body/signature profile;
3. trusted Warrant issuer;
4. enforcement domain;
5. validity window under S0 harness time;
6. Warrant transition commitment equals exact Transition Envelope commitment;
7. actual payload channel equals committed channel;
8. actual payload recipient equals committed recipient;
9. actual content type equals committed content type;
10. SHA-256 of exact payload bytes equals committed payload digest;
11. matching S0 `ISSUED` registration exists;
12. exact Warrant body digest equals the S0 registration.

Any failure before the atomic stage leaves the authority state at `ISSUED`.

## 5. Atomic stage

The local v0 implementation stores exact payload bytes inside the S0-owned SQLite database in table:

`e2_payload_stage`

The insert and:

`ISSUED -> PAYLOAD_STAGED`

occur inside one `BEGIN IMMEDIATE` transaction.

The stage record binds:

- issuer key id;
- nonce;
- transition commitment;
- Warrant body digest;
- payload digest;
- channel;
- recipient;
- content type;
- exact payload BLOB;
- byte length;
- creation time.

There is no update/replace operation for an existing stage.

## 6. Restart persistence

The reference witness closes the issuer/S0 process, reopens the same DB for E2, stages the payload, closes it again, then reopens S0 once more.

The witness requires:

- authority state remains `PAYLOAD_STAGED`;
- exact persisted payload bytes remain byte-equal to the frozen request artifact.

This supports only the tested SQLite/persistent-file boundary.

## 7. Key removal boundary

The workflow removes:

- controlled PayGod decision private key;
- controlled Warrant issuer private key;

before E2 staging.

Therefore E2's positive path uses only public trust, Warrant artifacts, Transition Envelope, payload bytes, and S0 state.

This does not prove hardware isolation; it proves the local witness does not require either private issuer key during staging.

## 8. Frozen adversarial coverage

E2 relies on the already-frozen catalogue, including:

- A3 — no Warrant;
- A4 — invalid signature;
- A5 — untrusted Warrant issuer;
- A6 — expired Warrant;
- A7 — not-yet-valid Warrant;
- A9 — changed payload bytes;
- A11 — wrong enforcement domain;
- A12/A23 — changed Transition Envelope;
- A22 — trusted issuer configuration boundary;
- A37 — wrong payload recipient;
- A38 — signed but unregistered Warrant;
- A39 — S0 Warrant-body mismatch;
- A43 — staged-payload replacement;
- A56 — self-authored Warrant trust anchor.

Unit tests also cover wrong channel/content type and alternate envelope serialization.

A56's full client-side configuration-substitution form remains a later C-boundary test; E2 v0 does not claim that a process with configuration-admin rights cannot replace its trust store.

## 9. Explicit non-actions

This slice performs none of:

- `PAYLOAD_STAGED -> TX_RESERVED`;
- E1 signing;
- local EVM transaction submission;
- provider payload release;
- provider worker invocation;
- ACP authentication;
- ACP Agent/Signer/Job actions;
- Quiver interaction;
- public/testnet/mainnet access.

## 10. Success criterion

E2 staging succeeds only if:

- Warrant verifies against external public trust;
- exact Transition Envelope verifies;
- all payload surface fields match;
- exact payload digest matches;
- S0 registration/body binding matches;
- exact payload bytes are durably persisted;
- S0 ends at `PAYLOAD_STAGED`;
- restart preserves exact staged bytes;
- no E1/provider/EVM consequence occurs.

## 11. Claim ceiling

A successful E2 slice supports only:

> Local E2 payload staging was runtime-observed for exact frozen payload bytes bound to a verified Warrant and Transition Envelope under the externally configured Warrant trust and S0 persistence boundary.

It does not establish Gate Zero, E1 enforcement, provider enforcement, Conditional Release Authority, or non-bypassability.

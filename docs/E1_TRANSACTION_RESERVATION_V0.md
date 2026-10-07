# E1 Transaction Reservation v0

Status: **IMPLEMENTATION SLICE — ENDS AT TX_RESERVED**

Purpose: verify that the controlled harness consumes one already-issued Warrant only when the exact transaction action committed in Transition Envelope v0 is presented after E2 has staged the payload.

This slice performs no signing and no transaction submission.

## 1. Entry condition

E1 reservation starts only after:

- canonical PayGod ALLOW decision authenticated;
- Warrant v0 issued and registered in S0;
- E2 verified exact payload bytes;
- S0 state = `PAYLOAD_STAGED`;
- external Warrant issuer trust is preconfigured.

## 2. Exact inputs

E1 receives:

- exact `warrant-body.json` bytes;
- exact `warrant.sig` bytes;
- externally configured trusted Warrant issuer set;
- exact `transition-envelope.json` bytes;
- actual transaction action proposal containing only:
  - `system`
  - `chainId`
  - `executionAccount`
  - `target`
  - exact `calldataBytes`
  - `nativeValue`
- constrained S0 access.

## 3. Verification sequence

Before reservation E1 verifies:

1. exact Transition Envelope byte profile;
2. exact Warrant body/signature profile;
3. trusted Warrant issuer;
4. enforcement domain;
5. validity window using S0 harness time;
6. Warrant transition commitment equals exact Transition Envelope commitment;
7. transaction system exactly matches;
8. chain id exactly matches;
9. execution account exactly matches;
10. target exactly matches;
11. SHA-256 of exact calldata bytes matches `calldata_sha256`;
12. native value exactly matches;
13. S0 is bound to the same Warrant body / transition / domain;
14. current S0 state is exactly `PAYLOAD_STAGED`.

Only then may S0 transition to `TX_RESERVED`.

## 4. Consumption point

The frozen consumption point remains:

`PAYLOAD_STAGED -> TX_RESERVED`

This transition atomically consumes the Warrant nonce for the transaction surface.

After `TX_RESERVED`:

- a second reservation for the same issuer/nonce must fail;
- restart must not restore the Warrant to a reusable state;
- later signing/submission failure does not make the Warrant reusable.

## 5. A55 operational-metadata boundary

Transition Envelope v0 intentionally does not pre-commit:

- account nonce;
- gas limit;
- gas price;
- EIP-1559 fee fields;
- raw signed transaction bytes;
- transaction signature.

Therefore the E1 protected request surface rejects caller-supplied values for those fields.

They will be derived internally by the future E1 execution slice.

This does not claim fee-risk control.

## 6. Frozen attacks covered by this slice

- A3 — no Warrant;
- A4 — invalid Warrant signature;
- A5 — untrusted issuer;
- A6/A7 — invalid time window;
- A8/A10 — transaction substitution;
- A11/A12 — wrong domain / stale transition;
- A13 — reuse after reservation;
- A36 — execution-account substitution;
- A40 — E1 before payload staging;
- A55 — operational transaction metadata injection;
- A56 — self-authored trust anchor remains governed by the preconfigured trust boundary.

Direct-RPC attacks A0/A17/A51-A54 require the later local EVM execution/topology slice and are not promoted to PASS here.

## 7. Separation from E2

E1 does not:

- parse request payload bytes;
- recompute payload policy;
- deliver payload;
- decide provider acceptance.

The only payload-related fact E1 relies on is the S0 state machine: transaction reservation is impossible until E2 has moved the authority record to `PAYLOAD_STAGED`.

## 8. Explicit non-actions

This slice performs none of:

- secp256k1 execution-key signing;
- raw transaction construction;
- EVM submission;
- Anvil interaction;
- contract execution;
- provider delivery;
- payload release;
- ACP / Quiver / public-network access.

## 9. Success criterion

E1 reservation succeeds only when:

- Warrant is valid under preconfigured trust;
- exact Transition Envelope is valid;
- all transaction action fields match;
- S0 is `PAYLOAD_STAGED`;
- S0 atomically returns `TX_RESERVED`;
- the nonce cannot be reserved again;
- no signature or external transaction is produced.

## 10. Claim ceiling

A successful E1 reservation slice supports only:

> Local E1 transaction reservation was runtime-observed for an exact transaction action bound to a verified Warrant and Transition Envelope after successful E2 staging, with S0 atomically consuming the authority record at TX_RESERVED.

It does not establish:

- execution-key isolation;
- transaction submission;
- Gate Zero;
- direct-RPC bypass resistance;
- protected contract consequence;
- Conditional Release Authority.

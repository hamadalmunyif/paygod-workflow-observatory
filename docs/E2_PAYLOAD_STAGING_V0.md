# E2 Payload Staging v0

Status: **FROZEN BEFORE E2 IMPLEMENTATION**

Purpose: define the local controlled-harness payload gate before any provider delivery or E1 execution exists.

This slice ends at:

`ISSUED -> PAYLOAD_STAGED`

It does not authorize transaction reservation, transaction signing/submission, payload release, provider delivery, or conformance.

## 1. E2 input

E2 receives:

- exact `warrant-body.json` bytes;
- exact `warrant.sig` bytes;
- read-only trusted Warrant-issuer public-key configuration;
- exact `transition-envelope.json` bytes;
- exact proposed payload bytes;
- actual payload channel;
- actual payload recipient;
- actual payload content type;
- access to S0 through the constrained staging operation.

E2 does not receive PayGod evidence or policy reasoning.

## 2. Verification order

E2 must fail closed in this order:

1. parse exact Transition Envelope v0 bytes;
2. verify the Warrant against the external trusted-issuer set;
3. verify Warrant enforcement domain;
4. verify Warrant validity window using S0 harness time;
5. verify Warrant transition commitment equals the exact Transition Envelope digest;
6. verify actual channel equals `payload.channel`;
7. verify actual recipient equals `payload.recipient`;
8. verify actual content type equals `payload.content_type`;
9. compute SHA-256 over exact payload bytes and compare with `payload.payload_sha256`;
10. atomically require a matching S0 `ISSUED` registration for the exact warrant-body digest;
11. atomically persist the exact payload bytes and transition S0 to `PAYLOAD_STAGED`.

A failure before step 11 must leave S0 at `ISSUED`.

## 3. Exact staged-byte storage

For the local v0 harness, staged payload bytes are stored inside the same S0-owned SQLite database in a separate table.

This is a deliberate local implementation choice to make:

`persist exact payload bytes + ISSUED -> PAYLOAD_STAGED`

one SQLite transaction.

The table is logically owned by E2 but physically co-located on the S0 private volume.

The client C has no supported direct SQL/filesystem access to this volume under T0.

## 4. Stage record identity

One stage record is keyed by:

- `issuer_key_id`
- `nonce`

and permanently binds:

- `transition_commitment`
- `warrant_body_sha256`
- `payload_sha256`
- `payload_channel`
- `payload_recipient`
- `payload_content_type`
- exact `payload_bytes`

There is no update/replace operation for staged bytes.

## 5. Immutability semantics

Once S0 reaches `PAYLOAD_STAGED`:

- a second stage attempt is rejected;
- different bytes cannot replace the staged bytes;
- same bytes are not silently treated as another stage event;
- the stored bytes must survive S0 restart;
- later E2 release must read the originally staged bytes, not caller-supplied replacement bytes.

## 6. No provider consequence in this slice

E2 staging does not call P.

The controlled provider worker remains absent/uninvoked.

Therefore a successful E2 staging witness proves only:

> exact payload bytes were accepted by the local E2 gate, bound to a verified Warrant/Transition commitment, and durably staged under S0.

It does not prove provider acceptance or split-channel completion.

## 7. Required rejection cases for this slice

Before the E2 staging slice may close, tests must cover at minimum:

- A3 no Warrant;
- A4 invalid Warrant signature;
- A5 untrusted Warrant issuer;
- A6 expired Warrant;
- A7 not-yet-valid Warrant;
- A9 changed payload bytes;
- A11 wrong enforcement domain;
- A12 stale/changed Transition Envelope;
- A22 trusted Warrant-issuer set not supplied from the configured boundary;
- A23 changed frozen Transition Envelope;
- A37 wrong payload recipient;
- A38 signed but unregistered Warrant;
- A39 Warrant-body digest differs from S0 registration;
- A43 staged-payload replacement.

Additional v0 surface checks:

- wrong payload channel;
- wrong payload content type;
- alternate Transition Envelope serialization;
- restart preserves exact staged bytes.

## 8. Claim ceiling

Passing this slice supports only:

> Local E2 payload staging was runtime-observed for exact bytes bound to a verified Warrant and Transition Envelope under the S0-controlled state boundary.

It does not support:

- E1 enforcement;
- provider enforcement;
- Gate Zero closure;
- Conditional Release Authority;
- non-bypassability;
- external-system portability.

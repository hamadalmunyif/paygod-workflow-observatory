# Authority State / Nonce Semantics v0

Status: **DESIGN FROZEN FOR CONTROLLED HARNESS**

Purpose: define where replay state lives and exactly when a Warrant v0 becomes irrevocably consumed.

## 1. State owner

The controlled harness uses one logical Authority State Store:

`S0`

S0 is not part of the client Agent process.

The client has no administrative write/reset API to S0 under Threat Model T0.

S0 is a trust root and attack surface in its own right.

## 2. Reference storage choice for v0

The reference harness storage is a durable SQLite database owned only by S0.

Required properties:

- WAL or equivalent transactional durability;
- persistent volume survives S0 process restart;
- the volume is not mounted into the client container/process;
- unique identity on `issuer_key_id + nonce`;
- conditional state transitions execute inside database transactions;
- no generic SQL or reset endpoint is exposed to the client.

This choice proves only the closed harness under its process/storage boundary. It is not equivalent to HSM, MPC, smart-account storage, or production-grade tamper resistance.

## 3. Record identity

Each state record is keyed by:

- `issuer_key_id`
- `nonce`

and permanently binds:

- `transition_commitment`
- `enforcement_domain`

A nonce may never be rebound to a different transition commitment.

## 4. State machine

Record creation occurs only through the frozen issuance-registration path.

A valid issuer registration atomically creates the record in `ISSUED`.

A duplicate `issuer_key_id + nonce` registration is rejected before the warrant is returned to the client.

Allowed states:

```text
ISSUED
  |
  v
PAYLOAD_STAGED
  |
  v
TX_RESERVED
  |
  v
TX_EXECUTED
  |
  v
PAYLOAD_RELEASED
  |
  v
CONFORMANT
```

Terminal/failure states:

- `REJECTED`
- `EXPIRED`
- `PARTIAL_TX_ONLY`
- `NONCONFORMANT`

State transitions are monotonic. No API may move a record backward.

## 5. ISSUED registration

The issuer registers:

- issuer key id;
- nonce;
- transition commitment;
- enforcement domain;
- not-before;
- expires-at;
- warrant-body digest.

S0 creates `ISSUED` only if the primary identity does not already exist.

This registration is part of issuance. A detached signature without successful S0 registration is not an issued harness warrant.

## 6. When the nonce is consumed

The nonce becomes irrevocably consumed when S0 atomically transitions:

`PAYLOAD_STAGED -> TX_RESERVED`

At that moment:

- the nonce is locked to the already-bound transition commitment;
- no second transaction reservation may succeed;
- failure after reservation does not make the nonce reusable;
- restart does not make the nonce reusable.

This conservative rule avoids ambiguity about whether a failed or partially submitted transaction may be safely replayed.

A new attempt requires a new nonce and, where appropriate, a new warrant.

## 7. Payload staging

`ISSUED -> PAYLOAD_STAGED` may occur only after E2 verifies:

- Warrant signature and trusted issuer;
- enforcement domain;
- validity window;
- transition envelope digest;
- exact payload digest/content type;
- nonce binding.

Staging does not yet authorize transaction execution.

The staged bytes are immutable for that state record.

A second staging attempt with different bytes for the same nonce is rejected.

## 8. Transaction reservation

E1 requests the transition:

`PAYLOAD_STAGED -> TX_RESERVED`

inside one atomic database transaction.

The conditional update succeeds only if:

- current state is exactly `PAYLOAD_STAGED`;
- issuer key id matches;
- nonce matches;
- transition commitment matches;
- domain matches;
- warrant remains within the accepted time policy.

Two concurrent reservations for the same nonce must yield at most one success.

## 9. Transaction result

After transaction submission:

- confirmed matching execution -> `TX_EXECUTED`;
- no matching execution and no ambiguous broadcast -> `REJECTED`;
- ambiguous/irreversible external state without full evidence -> `NONCONFORMANT` or `PARTIAL_TX_ONLY`.

The nonce remains consumed in all cases after `TX_RESERVED`.

## 10. Payload release

E2 may move:

`TX_EXECUTED -> PAYLOAD_RELEASED`

only after post-flight evidence proves that the observed transaction corresponds to the transaction surface committed by the same transition envelope.

E2 then releases the exact previously staged payload bytes to the controlled provider worker.

No client-supplied replacement bytes are accepted at release time.

## 11. Conformance

`PAYLOAD_RELEASED -> CONFORMANT`

requires the post-flight conformance checks defined by `POSTFLIGHT_EVIDENCE_V0.md`.

A transaction that exists on-chain without successful payload release must never be labeled `CONFORMANT`.

## 12. Restart test

A required attack test is:

1. successfully reserve/consume a nonce;
2. restart S0;
3. replay the same warrant;
4. verify rejection.

Passing this test supports restart persistence only for the tested SQLite/persistent-volume boundary.

## 13. Rollback/reset test

The attack catalogue must attempt every reset/rollback path available to the client under T0.

If the client can:

- delete the DB;
- replace the DB;
- mount an earlier snapshot;
- invoke an admin reset;
- cause S0 to forget a consumed nonce;

then the authority claim fails for T0.

Host/root compromise outside the frozen T0 boundary remains a declared assumption, not a tested negative.

## 14. Administrative reset

The controlled harness may have an operator-only destructive reset for test setup.

It must be:

- unavailable to the client;
- outside the protected runtime API;
- visibly logged;
- forbidden during a witness run.

A witness run performed after an administrative reset starts a new test epoch and cannot claim continuity with prior nonce history.

## 15. Claim boundary

This design can establish only:

- atomic nonce reservation in the tested store;
- persistence across the tested restart boundary;
- no client-accessible rollback observed under T0.

It does not establish:

- hardware-backed monotonic counters;
- rollback resistance against host administrators;
- production durability;
- global replay prevention across independent deployments.


## 16. Exact Warrant body binding at enforcement entry

Both `stagePayload` and `reserveTransaction` require the exact `warrant_body_sha256` and compare it to the value registered at `ISSUED`.

This makes a signed-but-unregistered or differently registered Warrant fail at the state boundary even if a caller forgets to perform a separate comparison.

This is defense in depth; E1/E2 still verify the signature and transition surface independently.

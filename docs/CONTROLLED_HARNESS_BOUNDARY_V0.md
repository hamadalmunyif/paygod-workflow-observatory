# Controlled Harness Boundary v0

Status: **DESIGN FROZEN FOR IMPLEMENTATION REVIEW**

Purpose: define the process, filesystem, network, and key boundaries assumed by Threat Model T0.

This document does not claim hardware isolation.

## 1. Logical runtime components

The future harness is partitioned into separate runtime components:

- `C` — controlled/adversarial client Agent;
- `D` — canonical PayGod decision path;
- `I` — Warrant issuer;
- `S0` — authority state / nonce store;
- `E2` — payload gate;
- `E1` — transaction gate and execution-key holder;
- `P` — controlled provider worker;
- `V` — post-flight verifier.

The implementation may use processes or containers, but the boundaries below must be preserved.

## 2. Key placement

### PayGod issuer key

Present only in `I`.

Not present in:

- C;
- E1;
- E2;
- P;
- V;
- shared artifact directories.

### Execution key

Present only in `E1`.

Not present in:

- C;
- D;
- I;
- S0;
- E2;
- P;
- V.

E1 does not expose a generic signing API.

### Trusted public issuer key

Read-only trust configuration is available to E1/E2 and, where needed, S0/V.

C may know the public key; secrecy is not required.

C must not have a supported mechanism to modify the trusted-key configuration used by enforcers.

## 3. Filesystem boundary

C must not share writable filesystem paths with:

- issuer private-key storage;
- execution private-key storage;
- S0 database;
- E2 staged-payload storage;
- enforcer trusted-key configuration.

Evidence export occurs through explicit artifact interfaces after state transitions, not through shared writable runtime state.

A shared read-only test-fixture directory is permitted if it contains no secret or mutable authority state.

## 4. S0 storage boundary

The S0 SQLite database resides on a persistent volume available only to S0/E2 constrained operations.

For local E2 v0, exact staged payload bytes are stored in a separate logical table inside this same SQLite database so that payload persistence and `ISSUED -> PAYLOAD_STAGED` are atomic.

This physical co-location does not give C SQL or filesystem access.

C has no filesystem mount of that volume.

The operator may possess host-level access, but host-admin compromise is outside T0 unless explicitly added later.

This limitation must appear in the final witness result.

## 5. Network boundary

C may have general outbound network capability under T0, including the ability to attempt:

- direct blockchain RPC;
- ACP-like API access;
- calls to exposed harness endpoints.

This is deliberate: the harness should not prove authority merely by pretending the Agent has no network.

However:

- C cannot derive a valid protected-account signature from network access alone;
- the execution key is reachable only through E1's constrained protected operation;
- P's protected provider-ingress interface accepts released payload only from E2;
- S0 administrative/reset interfaces are not routable from C;
- issuer administrative/key-management interfaces are not routable from C.

Any accidental route that violates these boundaries is a bypass candidate.

## 6. Public versus internal endpoints

### C may call

- PayGod request/decision entry point as defined for the harness;
- issuer request endpoint subject to issuance checks;
- E2 payload-stage endpoint;
- E1 protected-execution endpoint;
- ordinary public/external endpoints needed for attack attempts.

### C must not receive access to

- generic issuer signing;
- generic execution signing;
- S0 SQL/admin/reset;
- E2 force-release;
- P internal payload-ingress;
- trusted-key mutation;
- key export.

## 7. Provider boundary

P has one protected data-ingress path for the authoritative payload used by the controlled experiment:

`E2 -> P`

C may still attempt other network requests as attacks.

If C can cause P to treat an unverified payload as the protected requirement through another path, record `BYPASS_OBSERVED`.

Merely writing bytes to an unrelated HTTP endpoint is not equivalent to provider acceptance; the protected consequence must be defined in P and observed.

## 8. Decision/issuance boundary

D produces the canonical PayGod decision.

I is not allowed to synthesize an ALLOW decision.

I receives or retrieves the canonical decision artifact and checks the frozen issuance preconditions in `WARRANT_ISSUANCE_V0.md`.

D and I may run in separate processes to make the boundary observable, but separation by itself is not a security claim.

## 9. Verifier boundary

V has no private issuer or execution keys.

V consumes exported artifacts and external transaction observations.

V must not mutate S0, E1, E2, or P.

For the first harness, V remains within infrastructure controlled by us; therefore it is not Witness 006-level external independence.

## 10. Time source

The harness must name one time source before implementation.

Until an independently trusted time authority is introduced, time validity is a bounded harness assumption.

The witness may prove consistent use of the chosen source, not absolute trusted time.

## 11. Operator boundary

The human/operator may initialize the test environment and destroy/reset it between test epochs.

During a witness run, operator mutation of:

- keys;
- trust store;
- S0 database;
- staged payloads;
- enforcer code/config;

invalidates the run.

Operator/root compromise remains outside T0 in v0.

## 12. Boundary verification before each witness

Before a witness begins, record:

- component versions/digests;
- network topology/configuration;
- mounted volumes;
- key locations by component identity, without exposing key material;
- trusted issuer-key digest;
- S0 database identity/epoch;
- threat-model version;
- attack-catalogue version.

A mismatch from the frozen harness configuration invalidates comparison with prior runs.

## 13. Claim boundary

This boundary can support statements about:

- process/container separation actually configured;
- absence of supported client access to declared secret/state interfaces;
- observed resistance to frozen attack paths under T0.

It cannot support an absolute statement that the client can never read/export/replace a key under all possible host compromises.

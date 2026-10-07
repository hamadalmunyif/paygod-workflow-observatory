# Controlled Decision Authenticity v0

Status: **LOCAL HARNESS TRUST BRIDGE — NO WARRANT ISSUANCE YET**

Purpose: authenticate the canonical PayGod release receipt before any Warrant issuer is allowed to treat that decision as an authority input.

## 1. Roles

- `D` — canonical PayGod decision path using the pinned kernel and pinned controlled-release pack.
- `D-key` — a dedicated Ed25519 receipt-signing key for one controlled harness epoch.
- `I` — future Warrant issuer. Not implemented by this document.

The D-key is distinct from the future Warrant issuer key and from the future E1 execution key.

## 2. Existing PayGod profile reused

The harness reuses the pinned kernel's existing detached receipt-authentication profile:

- signature profile: `paygod-ed25519-receipt-v1`
- trust profile: `paygod-ed25519-trust-v1`
- algorithm: `Ed25519`

The signed message and verification semantics are owned by the pinned PayGod kernel implementation.

No parallel receipt-signature protocol is invented in the Observatory.

## 3. Harness epoch key

For the CI-controlled witness:

- D-key is generated ephemerally for the run;
- the private key stays outside the repository and outside the uploaded evidence directory;
- the corresponding trust store is generated separately from the PayGod bundle;
- the trust store is evidence/configuration supplied to the verifier, not self-asserted by the bundle;
- the private key is deleted after the witness step.

This establishes only a controlled harness trust root.

It is not HSM-backed institutional identity and does not define production rotation or revocation.

## 4. Required authenticated decision conditions

A future Warrant issuer may not treat a PayGod decision as eligible merely because the bundle has integrity.

Before issuance, the local harness must establish at least:

- exact Release Candidate derivation verified;
- candidate canonical input hash matches the PayGod receipt;
- pack name/version/digest match the frozen controlled-release profile;
- verdict matches the frozen allowed verdict;
- rule matches the frozen allowed rule;
- standalone bundle integrity is `verified`;
- receipt issuer authenticity is `verified`;
- trusted decision issuer key was used;
- receipt signature is valid;
- transition remains local chain 31337;
- enforcement domain remains `controlled-harness/t0-v0`;
- request attempt binding is present;
- external execution remains unauthorized at the decision stage.

## 5. Replay remains separate

Decision replay remains:

`not_performed`

A verified D signature authenticates the signing key for the exact receipt commitment.

It does not independently prove that an outside verifier replayed the policy computation.

Therefore:

`integrity verified != issuer authenticity verified != decision replayed`

The controlled harness may choose authenticated receipt as the D→I trust bridge under T0, but the no-replay limitation must remain visible.

## 6. Trust-store boundary

The bundle must not choose its own trusted D key.

The trusted D public key configuration is external to the PayGod evidence bundle.

If the adversarial client can replace the trust store used by I under T0, the authority hypothesis fails.

## 7. Claim ceiling

A passing witness supports only:

> A canonical local PayGod release receipt was authenticated against a controlled, externally supplied Ed25519 trust anchor for the harness epoch.

It does not prove:

- correctness of the decision;
- policy replay;
- institutional/legal identity;
- hardware key isolation;
- external-system acceptance;
- Warrant issuance;
- E1/E2 enforcement;
- Conditional Release Authority.

## 8. Issuance gate

Warrant issuance remains **NOT AUTHORIZED** until the authenticated-decision witness passes and the D→I rejection cases are frozen.

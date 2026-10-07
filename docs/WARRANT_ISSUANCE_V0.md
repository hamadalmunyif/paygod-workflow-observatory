# Warrant Issuance and Issuer Trust v0

Status: **DESIGN FROZEN FOR CONTROLLED HARNESS**

Purpose: prevent the Warrant issuer from becoming an unconstrained signing oracle while keeping enforcement verifiers independent from PayGod evidence reasoning.

## 1. Separation of roles

The controlled harness separates:

- **Decision Authority** — canonical PayGod decision path;
- **Warrant Issuer** — converts one eligible PayGod ALLOW decision into a Warrant v0;
- **E1/E2 Enforcers** — verify Warrant/Transition commitment and their own surfaces;
- **Verifier/Auditor** — examines post-flight evidence.

The enforcers do not rerun PayGod policy.

The issuer must not issue authority independently of the canonical decision path.

## 2. D -> I decision-authenticity precondition

Before any Warrant issuance is permitted, the issuer must reject a decision artifact unless the controlled D→I bridge establishes:

- exact Release Candidate derivation;
- pinned PayGod kernel/profile/pack identity;
- canonical candidate input-hash match;
- allowed verdict/rule;
- bundle integrity = `verified`;
- receipt issuer authenticity = `verified` against the external controlled D trust store.

Decision replay may remain `not_performed` in v0, but that limitation must be preserved in evidence and must not be relabeled as replay verification.

The D receipt-signing key is distinct from the Warrant issuer key.

## 3. Issuance preconditions

The issuer may sign a Warrant v0 only if all of the following are true:

1. a canonical PayGod decision artifact exists;
2. the decision outcome is exactly an allowed/releasable outcome defined for the harness;
3. the decision is bound to the frozen request identity;
4. the proposed Transition Envelope refers to that same request identity;
5. the transition was derived under the frozen harness transformation profile;
6. the transition commitment is computed from the exact frozen envelope bytes;
7. the requested enforcement domain matches the configured harness domain;
8. no existing warrant has already been issued for the same attempt in a way forbidden by the harness issuance policy.

A failure in any precondition is fail-closed.

## 4. The issuer is not a generic signing service

The issuer API must not expose:

- sign arbitrary bytes;
- sign arbitrary transition commitment;
- choose an arbitrary request identity without canonical decision evidence;
- override a denied PayGod decision;
- issue for an unknown enforcement domain.

If any such path exists within T0, it is an authority bypass.

## 5. Decision evidence stays outside Warrant v0

The issuer may maintain an audit record that binds:

- decision artifact digest;
- request identity;
- transition envelope digest;
- warrant-body digest;
- issuer key id;
- issuance timestamp under the declared time source.

This audit record is not required by E1/E2 for enforcement.

This preserves the architectural separation:

`evidence/policy -> PayGod decision -> issuer -> minimal warrant -> enforcer`

rather than:

`enforcer reruns PayGod evidence/policy`

## 6. Issuer key for controlled v0

The controlled harness uses one dedicated test issuer key.

Requirements:

- issuer private key is held only by the issuer component;
- it is not shared with E1 execution key material;
- it is not present in the client environment;
- E1 and E2 receive only the corresponding trusted public key;
- the key is used only for controlled-harness Warrant v0 issuance.

The controlled v0 profile fixes the issuer algorithm to `Ed25519`.

The exact representation and signing profile are defined in `CONTROLLED_HARNESS_IMPLEMENTATION_PROFILE_V0.md`.

## 7. issuer_key_id

For v0, `issuer_key_id` is derived from the exact Ed25519 DER SubjectPublicKeyInfo bytes as:

`ed25519-spki-sha256:<sha256-hex>`

The full byte/encoding profile is frozen in `CONTROLLED_HARNESS_IMPLEMENTATION_PROFILE_V0.md`.

No human-readable alias alone may establish issuer identity.

## 8. S0 issuance registration

A Warrant is not considered issued until the signed body is successfully registered in S0.

After signing, I submits:

- issuer key id;
- nonce;
- transition commitment;
- enforcement domain;
- not-before;
- expires-at;
- warrant-body digest.

S0 atomically creates the `ISSUED` record only if `issuer_key_id + nonce` is unused.

I returns the Warrant artifacts to C only after that registration succeeds.

This prevents two independently returned warrants from silently sharing the same nonce identity.

## 9. Trusted issuer configuration

E1 and E2 use a pinned, read-only trusted-issuer configuration.

The client must not have a supported runtime path to:

- add a new issuer;
- replace the trusted public key;
- remap an issuer id;
- disable issuer checking.

Attempting to modify the trusted set is part of the frozen attack catalogue.

## 10. Key compromise boundary

If the trusted issuer private key is compromised, the v0 issuer epoch is considered totally compromised.

The harness does not claim to solve this through testing.

Production topics such as:

- rotation;
- revocation;
- threshold issuance;
- HSM-backed issuer keys;
- remote attestation;
- key transparency;

remain future work.

## 11. Issuance attacks

The controlled harness must add the following tests before implementation:

### I0 — mint without canonical ALLOW

Attempt to obtain a warrant without an eligible canonical PayGod ALLOW decision.

Expected: reject.

### I1 — denied decision override

Use a canonical denied/non-releasable decision and request warrant issuance.

Expected: reject.

### I2 — request substitution before issuance

Present decision for request A but Transition Envelope referring to request B.

Expected: reject.

### I3 — transition substitution before issuance

Present a valid ALLOW decision but change the Transition Envelope after decision binding.

Expected: reject unless a newly evaluated canonical decision authorizes that exact transition.

### I4 — wrong enforcement domain issuance

Request a warrant for a domain outside the configured controlled harness.

Expected: reject.

### I5 — arbitrary signing oracle

Attempt to make the issuer sign arbitrary bytes or a caller-supplied commitment without the canonical issuance checks.

Expected: reject.

## 12. Claim boundary

Passing issuance tests proves only that the controlled issuer did not behave as an open mint under T0.

It does not prove:

- correctness of PayGod's decision;
- uncompromised issuer key;
- external trust in the issuer;
- legal or economic authority of the issuer;
- portability to other enforcers.

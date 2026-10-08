# Continuity of Identity v0

Status: **SECURITY INVARIANT / REVIEW MATRIX**

Purpose: prevent a valid artifact from run A from being reused to authorize or verify a different object from run B unless that boundary is explicitly declared reusable.

Core invariant:

> No authority may be issued for an object other than the exact object the authenticated decision actually evaluated, according to the declared binding semantics of that boundary.

This document separates four questions for every arrow:

1. **What is the declared edge semantics?**
2. **Enforced in code?**
3. **Negative A/B substitution test exists?**
4. **Independently reviewed after the current implementation?**

No row is described simply as "proven". The matrix is an internal engineering claim until independently re-reviewed.

## 1. Declared edge semantics

The matrix uses these semantics:

- **EXACT-RUN-BOUND** — the adjacent object must belong to the same exact run/object identity; cross-run substitution is expected to reject.
- **PROFILE-BOUND** — the object may be reused across runs only when it matches the frozen profile/policy identity; a different valid profile is expected to reject.
- **TRANSITION-BOUND** — reuse is allowed only for the exact committed transition.
- **STATE-BOUND** — acceptance additionally depends on the declared S0 lifecycle state.
- **INSTANCE-BOUND** — evidence must refer to the same observed execution/provider instance.
- **AUDIT-LINEAGE-ONLY** — the relation is recorded and checked by local audit/post-flight evidence but is not directly committed in the downstream signed object.

A/B tests must follow the declared semantics. They must not assume every cross-run substitution should reject.

## 2. Current identity-continuity matrix

| Arrow | Declared semantics | Enforced in code | Negative A/B substitution test | Independent review | Current note |
|---|---|---|---|---|---|
| Evidence artifact -> Request identity | EXACT-RUN-BOUND | YES — exact frozen artifact-byte commitments are used by admission | YES — Witness 002b adversarial admission family | NO current external re-review after later authority work | Local admission property only |
| Request identity + Transition -> Release Candidate | EXACT-RUN-BOUND | YES — candidate bytes must equal deterministic derivation from supplied request shadow and exact Transition Envelope | YES — A31/A32, derivation drift, and bidirectional A/B matrix | NO post-change independent review | Direct exact-byte derivation |
| Release Candidate -> PayGod validate hash | EXACT-RUN-BOUND | YES — Observatory recomputes `paygod-c14n-v1` from exact candidate bytes and compares it with `paygodValidate.data.hash` | YES — bidirectional Candidate/Validate A/B matrix | NOT YET — external review found the pre-fix defect; the fix has not yet been independently re-reviewed | Closes the reproduced decision-binding defect |
| Release Candidate -> Decision Receipt | EXACT-RUN-BOUND | YES — receipt `input.canonical_hash` must equal the recomputed current candidate canonical hash | YES — bidirectional Candidate/Receipt A/B matrix | NOT YET post-fix | Receipt authenticity alone is insufficient without this binding |
| Decision Receipt -> Verification result | EXACT-RUN-BOUND | YES — verification result must commit the exact receipt digest and trusted signature state | YES — bidirectional Receipt/Verification A/B matrix | NO post-change independent review | Verification metadata cannot be transplanted across receipts |
| Policy/pack identity -> Decision Receipt | PROFILE-BOUND | YES — receipt pack name/version/digest and allowed verdict/rule are checked against the controlled release profile; PayGod verifier also binds receipt to manifest/ledger | YES — bidirectional Profile/Receipt A/B matrix plus A48 mutation | Repository-level review only; not an external replay of the new A/B matrix | Policy identity is represented by pack name/version/digest, not a separate policy object |
| Decision Receipt -> Warrant body | AUDIT-LINEAGE-ONLY | NO direct cryptographic commitment in Warrant v0 | NO direct A/B rejection is possible from Warrant body alone | Repository review confirms the absence | Exact receipt/candidate identity is recorded in `warrant-issuance-audit/v0`, not in Warrant body |
| Warrant -> Transition | TRANSITION-BOUND | YES — signed Warrant body commits `transition_commitment`; verifiers require the expected transition | YES — bidirectional Warrant/Transition A/B matrix | Repository-level review | Direct signed transition binding |
| Warrant/Transition -> E2 payload surface | TRANSITION-BOUND + STATE-BOUND | YES — transition commits payload digest/channel/recipient/content type; E2 verifies exact staged bytes and S0 state | YES — frozen E2 substitution/release attacks include A19/A26/A37 and related tests | No external independent re-run | T0 controlled-harness result only |
| Warrant/Transition -> E1 transaction surface | TRANSITION-BOUND + STATE-BOUND | YES — transition commits execution account/target/calldata/value/chain; E1 requires staged state and consumes the nonce | YES — substitution and Gate Zero attempts, including alternate sender/raw transaction | No external independent re-run | T0 controlled-harness result only |
| Executed transition -> Post-flight evidence | INSTANCE-BOUND | YES — V re-reads transaction/receipt and derives instance binding | YES — A27/A28 and post-flight attack evidence | Separate process, not independent institution | Closed-harness conformance only |
| Released payload -> Provider observation | INSTANCE-BOUND | YES — exact staged bytes are released and compared with provider-received bytes/context | YES — direct ingress/wrong-payload/release-order attacks | Separate process, not independent institution | Closed-harness conformance only |

## 3. Reproduced defect and fix

Pre-fix behavior:

```text
Candidate B + Transition B
+
PayGod Validate A
+
authenticated Receipt A
        |
        v
AUTHENTICATED_CANONICAL_ALLOW
        |
        v
Warrant for B
```

The defect existed because admission compared:

`receipt.input.canonical_hash == paygodValidate.data.hash`

without proving either value belonged to the current Candidate bytes.

Post-fix admission requires:

```text
H = SHA256(paygod-c14n-v1(exact candidate bytes))

H == paygodValidate.data.hash
H == receipt.input.canonical_hash
```

The candidate bytes are first required to be the exact deterministic derivation of the supplied request shadow and Transition Envelope.

Therefore a coherent Candidate B / Transition B cannot reuse Validate A / Receipt A.

## 4. TOCTOU boundary

The issuer process reads Candidate bytes into memory and passes that snapshot into admission and Warrant issuance.

A later filesystem mutation does not change the in-memory candidate used to derive the decision binding.

A stale earlier `paygod-validate.json` is no longer sufficient: its hash must match the current candidate snapshot.

The authority workflow independently runs the pinned PayGod CLI on the candidate. The Observatory-side `paygod-c14n-v1` implementation therefore has an integration cross-check against the pinned kernel on the actual witness candidate.

This does not make Observatory a second decision engine. It computes only the canonical input identity needed to verify binding.

## 5. Automated A/B substitution matrix

`test/identity-continuity-v0.test.mjs` now exercises the decision/Warrant boundary as a table of bidirectional cross-run substitutions with explicit controls.

For each EXACT-RUN-BOUND or TRANSITION-BOUND case:

```text
A + A -> PASS
B + B -> PASS
A + B -> REJECT
B + A -> REJECT
```

For PROFILE-BOUND policy identity, the same profile may legitimately apply to multiple runs; the negative test substitutes a different valid pack/profile identity.

Current automated unit matrix covers:

- Request/Transition <-> Release Candidate;
- Release Candidate <-> PayGod validate hash;
- Release Candidate <-> Decision Receipt;
- Decision Receipt <-> Verification result;
- Policy/Profile <-> Decision Receipt;
- Warrant <-> Transition.

The first four cases are also non-adjacent enough to expose the original class of "valid artifact from run A + coherent object from run B" rather than mutation-only failures.

Downstream E1/E2/post-flight/provider rows remain exercised by their frozen runtime attack suites rather than duplicated as unit fixtures in this file.

The Decision Receipt -> Warrant v0 row is intentionally not marked covered: Warrant v0 has no direct decision-receipt commitment, so there is no honest Warrant-body A/B rejection test for that relation.

## 6. Receipt -> Warrant v0 limitation and T0-I

Warrant v0 intentionally contains:

- enforcement domain;
- transition commitment;
- validity window;
- nonce;
- Warrant issuer key id.

It does **not** contain:

- decision receipt SHA-256;
- release-candidate canonical hash;
- pack/policy digest;
- decision issuer key id.

The issuance audit records these relations locally, and post-flight V checks the audit against the current receipt/candidate/Warrant.

However, because exact decision identity is not committed inside the signed Warrant body, Warrant v0 alone cannot prove which exact authenticated receipt caused issuance.

Current classification:

- **execution transition binding:** enforced;
- **portable exact decision lineage:** not directly enforced by Warrant v0;
- **remote bypass demonstrated:** no;
- **issuer integrity:** an explicit T0 trust assumption;
- **new Warrant version authorized now:** no.

Under **T0-I**, the Warrant issuer process and its signing key are assumed uncompromised during the witness epoch. If that assumption fails, a valid Warrant may be minted without a canonical PayGod decision and E1/E2 cannot detect that fact from Warrant v0 alone. The audit trail may expose the missing lineage later; it does not prevent the issuance.

Do not introduce Warrant v1 or a new signed decision-binding object before AP2 Collision Pass B determines whether PayGod should own this authority primitive at all.

## 7. Policy identity

For the controlled harness, the evaluated policy is represented by the frozen PayGod pack identity:

- name;
- version;
- SHA-256 digest;
- allowed verdict;
- allowed rule.

The receipt is checked against that identity and the independent PayGod verifier binds the receipt to the locked manifest/ledger.

This does not establish a general enterprise policy-registry or policy-authority model.

## 8. Review status and claim discipline

The current matrix is authored inside the same repository and therefore remains a **self-asserted engineering matrix**.

The external review that found the original Candidate/Receipt defect predates the current fix. Independent human re-review of the post-fix matrix is:

> **NOT YET OBTAINED**

Permitted wording is limited to:

> The controlled issuer bridge is implemented and regression-tested to require that the authenticated PayGod receipt and canonical validate result refer to the exact current Release Candidate before any Warrant can be issued.

Do not infer:

- independent institutional decision lineage;
- independent external validation of the current fix;
- Warrant originality;
- external issuer provenance;
- production key/state independence;
- universal end-to-end binding outside the tested boundaries.

## 9. Next gate

After this continuity closure is green on CI, the next steps are:

1. independent re-review of the current implementation and A/B matrix;
2. AP2 Collision Pass B.

The direct Receipt -> Warrant lineage limitation is carried into Pass B rather than solved by adding a new authority primitive beforehand.

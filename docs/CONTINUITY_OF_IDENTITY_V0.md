# Continuity of Identity v0

Status: **SECURITY INVARIANT / REVIEW MATRIX**

Purpose: prevent a valid artifact from run A from being reused to authorize or verify a different adjacent object from run B.

Core invariant:

> No authority may be issued for an object other than the exact object the authenticated decision actually evaluated.

This document separates three questions for every arrow:

1. **Enforced in code?**
2. **Negative A/B substitution test exists?**
3. **Independently reviewed after the current implementation?**

No row is described simply as "proven".

## 1. Current identity-continuity matrix

| Arrow | Enforced in code | Negative A/B substitution test | Independent review | Current note |
|---|---|---|---|---|
| Evidence artifact -> Request identity | YES — exact frozen artifact-byte commitments are used by admission | YES — Witness 002b adversarial admission family | NO current external re-review after later authority work | Local admission property only |
| Request identity + Transition -> Release Candidate | YES — candidate bytes must equal the deterministic derivation from the supplied request shadow and exact Transition Envelope | YES — A31/A32 plus candidate derivation drift tests | NO post-change independent review | Direct exact-byte derivation |
| Release Candidate -> PayGod validate hash | **YES after this change** — Observatory recomputes `paygod-c14n-v1` from the exact candidate bytes and compares it to `paygodValidate.data.hash` | **YES** — coherent Candidate B + Transition B with Validate A is rejected | **NOT YET** — external review found the pre-fix defect; the fix has not yet been independently re-reviewed | This closes the reproduced decision-binding defect |
| Release Candidate -> Decision Receipt | **YES after this change** — receipt `input.canonical_hash` must equal the recomputed current candidate canonical hash | **YES** — Receipt/Validate A + Candidate B is rejected | NOT YET post-fix | Receipt authenticity alone is insufficient without this binding |
| Policy/pack identity -> Decision Receipt | YES — receipt pack name/version/digest and allowed verdict/rule are checked against the controlled release profile; the PayGod verifier also binds receipt to manifest/ledger | YES — valid-shaped Policy B receipt against Profile A is rejected; existing A48 covers mutation | Repository-level review only; not an external replay of the new A/B matrix | Policy identity is currently represented by pack name/version/digest, not a separate policy object |
| Decision Receipt -> Warrant body | **NO direct cryptographic commitment in Warrant v0** | NO direct A/B rejection is possible from Warrant body alone | Repository review confirms the absence | Warrant v0 binds the authorized transition, domain, time, nonce and issuer. Exact receipt/candidate identity is recorded only in `warrant-issuance-audit/v0`. This is sufficient for the current controlled harness operational record but is **not independently portable decision-lineage proof** |
| Warrant -> Transition | YES — signed Warrant body commits `transition_commitment`; verifiers require the expected transition | YES — Warrant A against Transition B is rejected | Repository-level review | Direct signed binding |
| Warrant/Transition -> E2 payload surface | YES — transition commits payload digest/channel/recipient/content type; E2 verifies exact staged bytes and S0 state | YES — frozen E2 substitution/release attacks include A19/A26/A37 and related tests | No external independent re-run | T0 controlled-harness result only |
| Warrant/Transition -> E1 transaction surface | YES — transition commits execution account/target/calldata/value/chain; E1 requires staged state and consumes the nonce | YES — substitution and Gate Zero attempts, including alternate sender/raw transaction | No external independent re-run | T0 controlled-harness result only |
| Executed transition -> Post-flight evidence | YES — V re-reads transaction/receipt and derives instance binding | YES — A27/A28 and post-flight attack evidence | Separate process, not independent institution | Closed-harness conformance only |
| Released payload -> Provider observation | YES — exact staged bytes are released and compared with provider-received bytes/context | YES — direct ingress/wrong-payload/release-order attacks | Separate process, not independent institution | Closed-harness conformance only |

## 2. Reproduced defect and fix

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

## 3. TOCTOU boundary

The issuer process reads Candidate bytes into memory and passes that snapshot into admission and Warrant issuance.

A later filesystem mutation does not change the in-memory candidate used to derive the decision binding.

A stale earlier `paygod-validate.json` is no longer sufficient: its hash must match the current candidate snapshot.

The authority workflow independently runs the pinned PayGod CLI on the candidate. The Observatory-side `paygod-c14n-v1` implementation therefore has an integration cross-check against the pinned kernel on the actual witness candidate.

This does not make Observatory a second decision engine. It computes only the canonical input identity needed to verify binding.

## 4. Adjacent A/B substitution rule

For every adjacent pair in the authority chain, tests should prefer:

```text
valid object from run A
+
valid adjacent object from run B
        ↓
REJECT
```

over mutation-only tests where possible.

Mutation tests remain useful but do not substitute for cross-run identity tests.

The first implemented matrix covers:

- Transition/Candidate B + Validate/Receipt A;
- Policy/Receipt B + Profile A;
- Receipt A + verification result B;
- Warrant A + Transition B.

Further adjacent-pair cases should be added when a new boundary is introduced; they do not justify opening a new product or protocol scope.

## 5. Receipt -> Warrant v0 limitation

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

The issuance audit records all of these relations locally, and post-flight V checks the audit against the current receipt/candidate/Warrant.

However, because the exact decision identity is not committed inside the signed Warrant body, Warrant v0 alone cannot prove which exact authenticated receipt caused issuance.

Current classification:

- **execution transition binding:** enforced;
- **portable exact decision lineage:** not directly enforced by Warrant v0;
- **remote bypass demonstrated:** no;
- **new Warrant version authorized now:** no.

Do not introduce Warrant v1 or a new signed decision-binding object before AP2 Collision Pass B determines whether PayGod should own this authority primitive at all.

## 6. Policy identity

For the controlled harness, the evaluated policy is represented by the frozen PayGod pack identity:

- name;
- version;
- SHA-256 digest;
- allowed verdict;
- allowed rule.

The receipt is checked against that identity and the independent PayGod verifier binds the receipt to the locked manifest/ledger.

This does not establish a general enterprise policy-registry or policy-authority model.

## 7. Claim discipline

After this fix, permitted wording is limited to:

> The controlled issuer bridge verifies that the authenticated PayGod receipt and canonical validate result refer to the exact current Release Candidate before any Warrant can be issued.

Do not infer:

- independent institutional decision lineage;
- Warrant originality;
- external issuer provenance;
- production key/state independence;
- universal end-to-end binding outside the tested boundaries.

## 8. Next gate

After this binding fix and its regression witness are merged:

`AP2 Collision Pass B`

remains the governing next step.

The direct Receipt -> Warrant lineage limitation is carried into Pass B rather than solved by adding a new authority primitive beforehand.

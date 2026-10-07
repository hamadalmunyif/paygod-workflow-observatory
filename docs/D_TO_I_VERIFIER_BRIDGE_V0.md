# D-to-I Verifier Bridge Hardening v0

Status: **LOCAL SLICE 1B TRUST-BOUNDARY HARDENING**

Purpose: ensure the local Warrant issuer derives decision trust from the established PayGod verifier rather than accepting a caller-supplied verification result.

## 1. Closed weakness

Before this hardening, the issuer CLI accepted:

`--verification <json>`

and then treated that JSON as the verifier result.

Even when the workflow generated that file correctly, the issuer path itself did not enforce its provenance.

This hardening removes that input.

The issuer CLI now accepts only:

- the PayGod decision bundle;
- the external controlled D trust store;
- the frozen Release Candidate / profile / validate artifacts;
- S0/output paths.

The issuer process invokes:

`external/paygod-kernel/tools/verify_portable_evidence.py`

with:

`--require-issuer-authenticity`

and only then calls the local issuer core.

## 2. Preserved separation

This preserves the trust rule established earlier:

`producer-written trust != verifier-derived trust`

The Warrant issuer still does not replay PayGod policy.

Decision replay remains:

`not_performed`

The bridge authenticates the canonical receipt under the controlled D trust anchor; it does not independently recompute the decision.

## 3. Adversarial checks

The workflow now exercises the established PayGod verifier against:

- A44 — missing receipt signature;
- A45 — signer absent from the externally supplied trust store;
- A46 — receipt mutated after signing.

All three must fail before local Warrant issuance proceeds.

## 4. A49 / A50 remain open

This hardening does not convert the following into global PASS results:

- A49 — adversarial client modifies the D trust store used by the issuer;
- A50 — adversarial client reaches a D signing oracle.

Those require the future separated C / D / I runtime boundary.

In Slice 1b, the trust store and D signing operation remain inside the controlled workflow/operator boundary.

## 5. No execution expansion

This hardening adds none of:

- E1 transaction enforcement;
- E2 payload enforcement;
- execution-key signing;
- EVM transaction submission;
- provider delivery;
- ACP/Quiver/public-network interaction.

S0 remains at `ISSUED`.

## 6. Claim ceiling

After this hardening, the maximum Slice 1b statement remains:

> An authenticated canonical local PayGod ALLOW decision was converted into one signed local Warrant v0 and durably registered as ISSUED in S0, with decision authenticity re-derived inside the issuer bridge from the established PayGod verifier.

This does not establish Conditional Release Authority or non-bypassability.

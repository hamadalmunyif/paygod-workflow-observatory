# Release Decision Contract v0

Status: **FROZEN BEFORE RELEASE-PACK / ISSUER IMPLEMENTATION**

Purpose: define the semantic boundary between evidence/request admission and execution release.

The existing ACP request-admission shadow decision is **not** a release decision.

## 1. Critical semantic separation

The existing pack:

`acp-request-admission-shadow`

may return:

`verdict.value = "allow"`

with rule:

`shadow-admitted`

but its own policy reason states that ACP execution remains unauthorized.

Therefore:

> A shadow-admission ALLOW is not releasable authority.

No Warrant v0 may be issued directly from that receipt.

Any implementation that treats `shadow-admitted` as a release authorization violates this contract.

## 2. Two canonical decisions

The controlled harness uses two distinct PayGod decisions.

### D1 — Admission decision

Question:

> Is this exact request candidate admitted under the frozen observation/request-admission rules?

Canonical pack:

`acp-request-admission-shadow`

Expected eligible result:

- verdict = `allow`
- rule = `shadow-admitted`

Meaning:

`ADMISSION_ELIGIBLE_ONLY`

It authorizes no execution.

### D2 — Release decision

Question:

> Given an already admitted request and one exact Transition Envelope, is this local controlled-harness transition eligible for release?

Canonical pack:

`controlled-transition-release-v0`

Expected eligible result:

- verdict = `allow`
- rule = `local-release-eligible`

Meaning:

`LOCAL_CONTROLLED_RELEASE_ELIGIBLE`

This result is still not a Warrant. It is the canonical decision artifact from which the Warrant issuer may proceed after its own frozen linkage checks.

## 3. Scope of D2

D2 is strictly local-harness policy.

It must never authorize:

- ACP production;
- ACP testnet;
- Quiver;
- Base mainnet;
- Base Sepolia;
- a funded wallet;
- a third-party provider;
- any external economic transition.

The fixed v0 enforcement domain is:

`controlled-harness/t0-v0`

Any other domain is non-releasable.

## 4. Release Candidate v0

D2 consumes one exact JSON input artifact:

`release-candidate.json`

Logical shape:

```json
{
  "schema": "workflow-observatory/release-candidate/v0",
  "mode": "controlled-harness-local",
  "request_identity_sha256": "<64 lowercase hex>",
  "admission": {
    "request_shadow_canonical_hash": "<64 lowercase hex>",
    "receipt_sha256": "<64 lowercase hex>"
  },
  "transition": {
    "transition_commitment": "<64 lowercase hex>",
    "enforcement_domain": "controlled-harness/t0-v0",
    "execution_account": "0x...",
    "payload_recipient": "0x..."
  }
}
```

The candidate is a decision input, not self-authenticating authority.

Producer-written values inside it do not prove admission or release correctness by themselves.

## 5. Release Candidate construction preconditions

The controlled decision adapter may build `release-candidate.json` only after verifying all of:

1. exact `request-shadow.json` is available;
2. its `request.admittedRequestIdentitySha256` is non-null and valid;
3. D1 receipt is available;
4. D1 receipt pack is exactly the frozen admission pack/version;
5. D1 receipt verdict is exactly `allow`;
6. D1 receipt rule is exactly `shadow-admitted`;
7. canonical Kernel validation of exact `request-shadow.json` equals D1 `receipt.input.canonical_hash`;
8. exact Transition Envelope v0 is available;
9. its request identity equals the admitted request identity;
10. transition commitment is recomputed from exact Transition Envelope bytes;
11. enforcement domain equals `controlled-harness/t0-v0`;
12. execution account and payload recipient come from the exact Transition Envelope;
13. `admission.receipt_sha256` is SHA-256 over the exact D1 receipt bytes.

Failure of any precondition is fail-closed and D2 must not run.

## 6. Kernel canonicalization ownership

The Observatory must not reimplement `paygod-c14n-v1` to establish D1/D2 input identity.

For the controlled harness, canonical input hash is obtained from the pinned canonical Kernel CLI:

`PayGod.Cli validate --input <file> --json`

The returned canonical hash must equal the relevant receipt `input.canonical_hash`.

This preserves the Kernel as the canonical owner of decision-critical canonicalization.

## 7. D2 pack identity

The only v0 release pack eligible for Warrant issuance is:

- name: `controlled-transition-release-v0`
- version: frozen by the implementation PR

The issuer must pin both pack name and version.

A generic PayGod `allow` from any other pack is not release authority.

## 8. Issuer linkage after D2

A Warrant issuer may proceed only after verifying:

### D1 linkage

- exact D1 receipt bytes;
- D1 receipt SHA-256;
- D1 pack identity;
- D1 verdict/rule;
- D1 receipt input canonical hash equals Kernel validation of exact request-shadow input.

### D2 linkage

- exact D2 receipt bytes;
- D2 pack identity;
- D2 verdict = `allow`;
- D2 rule = `local-release-eligible`;
- D2 receipt input canonical hash equals Kernel validation of exact release-candidate input.

### Cross-artifact linkage

- release candidate admission receipt digest equals exact D1 receipt digest;
- release candidate request identity equals request-shadow admitted identity;
- release candidate transition commitment equals exact Transition Envelope commitment;
- release candidate execution account equals Transition Envelope execution account;
- release candidate payload recipient equals Transition Envelope payload recipient;
- release candidate enforcement domain equals Warrant enforcement domain.

Only then may the issuer create/register Warrant v0.

## 9. Why D2 is separate from the issuer

The issuer is not a policy engine.

D2 answers whether the transition is eligible under PayGod policy.

The issuer translates one already eligible canonical D2 decision into the minimal authority object.

This preserves:

`evidence/admission -> canonical release decision -> warrant issuer -> enforcers`

and avoids:

`issuer invents release policy`.

## 10. Why D1 remains relevant

D2 does not replace request admission.

D1 establishes the frozen request-admission result.

D2 binds that admitted request to one exact local transition proposal.

The trust progression is:

```text
Observation Pack
  -> Request Identity
  -> D1 Admission Decision
  -> Transition Envelope
  -> D2 Release Decision
  -> Warrant v0
```

Each step has a different meaning.

## 11. Receipt authenticity boundary

In the first controlled harness, D and I are components inside infrastructure operated by us.

The first local implementation may rely on the controlled internal D -> I artifact path plus exact receipt/input linkage.

This does **not** establish externally authenticated PayGod receipts.

If D1/D2 receipts are later transported across an untrusted boundary, receipt issuer authenticity must be added explicitly using the Kernel's receipt-signature/trust-store mechanism or an equivalent independently verified trust mechanism.

## 12. Frozen negative cases

Before issuer implementation, tests must include:

- D1 `allow/shadow-admitted` presented directly to issuer -> reject;
- D1 wrong pack -> reject;
- D1 wrong rule -> reject;
- D1 input canonical-hash mismatch -> reject;
- release candidate request identity differs from request-shadow -> reject;
- release candidate admission receipt digest mismatch -> reject;
- transition commitment mismatch -> reject;
- execution-account mismatch -> reject;
- payload-recipient mismatch -> reject;
- wrong enforcement domain -> reject;
- D2 missing -> reject;
- D2 wrong pack -> reject;
- D2 non-allow verdict -> reject;
- D2 wrong rule -> reject;
- D2 input canonical-hash mismatch -> reject.

Expected failures are frozen before implementation.

## 13. Claim boundary

A valid D2 release decision proves only:

> the canonical Kernel returned the frozen local release-policy result for the exact release-candidate input committed by its canonical input hash.

It does not prove:

- correctness of the underlying evidence;
- authenticity of an externally transported receipt;
- Warrant validity;
- enforcement;
- non-bypassability;
- external portability;
- economic correctness.

Those remain separate claims.

## 14. Implementation gate

The next implementation slice may add:

- Release Candidate v0 builder/verifier;
- `controlled-transition-release-v0` local-only policy pack;
- D1/D2 linkage verifier;
- issuer precondition function that accepts only an eligible D2 chain.

It must not yet add E1/E2 external execution behavior.

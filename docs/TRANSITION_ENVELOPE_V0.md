# Transition Envelope v0

Status: **FROZEN DATA CONTRACT FOR CONTROLLED-HARNESS DESIGN**

Purpose: define exactly what PayGod means by "the same consequential transition" before any warrant or enforcement implementation exists.

This document intentionally separates transition identity from evidence reasoning.

## 1. Design rule

The transition envelope is a frozen artifact that binds all execution-relevant channels of one proposed transition.

For ACP v0, the minimum protected transition has two surfaces:

- transaction surface;
- requirement-payload surface.

The envelope does not contain policy reasoning or evidence graphs.

## 2. Byte rule

The transition commitment is:

`SHA256(exact frozen bytes of transition-envelope.json)`

No semantic JSON equivalence is implied.

Re-serialization changes the transition commitment unless the exact stored bytes are preserved.

This mirrors the byte-exact discipline established for request identity v0.

## 3. Minimal logical fields

A v0 envelope contains:

- `schema` = `paygod/transition-envelope/v0`
- `request_identity_sha256`
- `transaction`
- `payload`

### transaction

The transaction object binds:

- `system` — e.g. `evm`
- `chain_id`
- `target`
- `calldata_sha256`
- `native_value`

The digest covers the exact calldata bytes that would be submitted.

Any change in target, chain, calldata, or native value is a different transition.

### payload

The payload object binds:

- `channel` — for the ACP experiment, `acp-requirement-message`
- `content_type` — expected `requirement`
- `payload_sha256`

The payload digest covers the exact frozen payload bytes intended for remote submission.

No parser-derived semantic equivalence upgrades a mismatching byte representation to equality.

## 4. Example shape

```json
{
  "schema": "paygod/transition-envelope/v0",
  "request_identity_sha256": "<sha256>",
  "transaction": {
    "system": "evm",
    "chain_id": 8453,
    "target": "0x...",
    "calldata_sha256": "<sha256>",
    "native_value": "0"
  },
  "payload": {
    "channel": "acp-requirement-message",
    "content_type": "requirement",
    "payload_sha256": "<sha256>"
  }
}
```

The example is illustrative only. No live target or transaction is authorized.

## 5. Why request identity remains present

`request_identity_sha256` binds the transition back to the already-frozen request contract.

It does not replace the transaction or payload commitments.

The relationship is:

`request identity -> proposed transition -> transition commitment`

not:

`request identity == execution identity`

## 6. Transition commitment

The issuer computes:

`transition_commitment = SHA256(exact bytes of transition-envelope.json)`

The future warrant refers only to this commitment.

An enforcement point may parse the envelope to check its own surface, but it must also verify that the envelope bytes hash to the commitment named by the warrant.

## 7. Enforcement split

### E1 — transaction verifier

E1 verifies:

- warrant validity;
- transition commitment;
- exact envelope bytes;
- chain id;
- target;
- exact calldata digest;
- native value;
- nonce consumption semantics.

E1 does not need to understand the evidence or policy that produced the warrant.

### E2 — payload verifier

E2 verifies:

- warrant validity or a derived authorization bound to the same transition commitment;
- exact envelope bytes;
- exact payload digest;
- expected content type;
- remote job/transition context required by the controlled provider;
- nonce/transition consumption semantics appropriate to the design.

E2 does not need to understand PayGod evidence or policy.

## 8. Job identity caveat

In the currently reviewed ACP flow, the on-chain job id is produced after transaction submission.

Therefore v0 does not assume that the preflight envelope can contain the future job id.

The controlled harness must define how post-create job identity is bound back to the already-authorized transaction, for example through transaction receipt/event evidence.

This is post-flight binding, not part of the pre-execution transition commitment unless a future rail exposes a deterministic precomputable instance id.

## 9. Attempt identity

The existing `attempt_id` remains a local attempt-correlation artifact.

It is not silently injected into the ACP requirement payload.

If a future enforcement rail provides an independently observable carrier, that can be evaluated separately.

Until then, `attempt_id` is not part of the external authority claim.

## 10. Excluded from v0

The envelope deliberately excludes:

- evidence graph;
- evidence root;
- policy text;
- decision rationale;
- verifier trust labels;
- economic value claims;
- provider reputation;
- post-flight outcome;
- issuer signature.

Those belong to adjacent artifacts.

The envelope answers only:

> What exact multi-surface transition is being authorized?

## 11. Falsification conditions

The envelope design fails its purpose if:

- a changed transaction can satisfy the same transition commitment;
- a changed payload can satisfy the same transition commitment;
- E1 or E2 must reproduce PayGod's evidence reasoning to verify its surface;
- the same commitment can ambiguously refer to more than one frozen envelope;
- implementation silently normalizes differing payload bytes into equality.

## 12. Claim boundary

A transition commitment proves only commitment to the frozen envelope bytes.

It does not prove:

- that the request is correct;
- that the evidence is authentic;
- that PayGod's decision is correct;
- that the issuer key is uncompromised;
- that execution actually occurred;
- that all external channels are covered.

Those remain separate trust dimensions.

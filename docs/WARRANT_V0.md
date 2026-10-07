# Warrant v0

Status: **FROZEN MINIMAL AUTHORITY CONTRACT FOR CONTROLLED-HARNESS DESIGN**

Purpose: define the smallest authority object needed for a verifier to decide whether one already-frozen transition may proceed.

Warrant v0 intentionally does not contain PayGod's evidence graph or policy reasoning.

## 1. Logical fields

Warrant v0 contains only:

- `schema` = `paygod/warrant/v0`
- `enforcement_domain`
- `transition_commitment`
- `not_before`
- `expires_at`
- `nonce`
- `issuer_key_id`
- `signature`

## 2. Signing representation

To avoid self-reference and accidental semantic canonicalization, the logical warrant is represented as two artifacts:

1. `warrant-body.json`
2. `warrant.sig`

`warrant-body.json` contains every field above except `signature`.

The issuer signs the exact frozen bytes of `warrant-body.json`.

`warrant.sig` stores the resulting signature plus the signature-algorithm identifier required by the verifier.

The logical `signature` field therefore means the detached signature over exact body bytes.

No verifier may reconstruct or re-serialize the body and silently treat different bytes as the signed artifact.

## 3. Body example

```json
{
  "schema": "paygod/warrant/v0",
  "enforcement_domain": "controlled-acp/t0",
  "transition_commitment": "<sha256>",
  "not_before": "<time>",
  "expires_at": "<time>",
  "nonce": "<single-use nonce>",
  "issuer_key_id": "<trusted issuer key id>"
}
```

The example is illustrative only and authorizes nothing.

## 4. Enforcement domain

`enforcement_domain` prevents a valid warrant from one enforcement environment being replayed into another.

A verifier must reject a warrant whose domain does not exactly match its configured domain.

The domain is not a marketing name. It is a verifier-controlled namespace.

## 5. Transition commitment

`transition_commitment` is the SHA-256 digest of the exact frozen bytes defined by `TRANSITION_ENVELOPE_V0.md`.

The warrant does not need to understand:

- request semantics;
- evidence provenance;
- policy logic;
- ACP offering semantics.

It authorizes only the named transition commitment.

## 6. Time window

`not_before` and `expires_at` bound the validity interval.

The exact trusted-time source is not solved by v0.

Therefore the controlled harness must declare its time authority and classify that assumption separately.

A local wall clock must not silently become "trusted external time."

## 7. Single-use nonce

Every v0 warrant is single-use.

The nonce is not sufficient by itself.

The enforcement design must maintain consumed-nonce state and perform an atomic consume operation.

Required invariant:

`valid signature + valid time + valid domain + matching transition + unused nonce -> at most one authorization`

Replay after consumption must fail.

Concurrent double use must allow at most one success.

## 8. Issuer key

`issuer_key_id` identifies the public key the verifier is configured to trust.

A mathematically valid signature from an unknown key is not authority.

The verifier must fail closed when:

- key id is unknown;
- key material does not match the configured id;
- signature is invalid;
- body bytes differ from the signed bytes.

A compromise of a trusted issuer private key is total authority compromise for that issuer epoch under T0.

Production-grade rotation/revocation infrastructure is outside v0.

## 9. Verifier duties

A v0 enforcement verifier must:

1. load exact warrant-body bytes;
2. resolve `issuer_key_id` against its trusted-key set;
3. verify the detached signature over those exact bytes;
4. verify `enforcement_domain`;
5. verify the validity time window under the declared time source;
6. verify that the referenced transition envelope bytes hash to `transition_commitment`;
7. verify the verifier's own execution surface against that envelope;
8. atomically verify-and-consume the nonce before authorizing the protected transition.

The verifier must not need to evaluate PayGod evidence or rerun PayGod policy.

## 10. Separation from decision evidence

The reason PayGod issued the warrant belongs to the decision/evidence bundle.

A future audit artifact may refer from the warrant to a decision bundle, but such a reference is not required for enforcement in v0.

This is deliberate.

The enforcement point answers:

> Is this exact transition currently authorized by a trusted issuer for my domain?

It does not answer:

> Was the issuer's underlying reasoning correct?

## 11. No authority from producer labels

Fields or labels embedded by an Agent, provider, request producer, or external rail such as:

- `trusted`
- `approved`
- `verified`
- `authorized`

have no authority unless they are inside the exact issuer-signed warrant body defined here.

## 12. Falsification conditions

Warrant v0 fails its purpose if any of the following is possible inside T0:

- authorization without a warrant;
- authorization with an invalid or unknown issuer;
- authorization for a different transition commitment;
- authorization outside the validity window;
- successful reuse of a consumed nonce;
- two successful concurrent uses of one nonce;
- acceptance after Agent-controlled nonce-state rollback;
- acceptance in the wrong enforcement domain;
- verifier acceptance that requires trusting producer-written authority labels.

## 13. Non-claims

A valid warrant does not prove:

- correctness of PayGod's decision;
- authenticity of underlying evidence;
- uncompromised issuer key;
- globally non-bypassable execution;
- external-system portability;
- post-flight conformance;
- economic liability coverage.

Those are separate claims and separate witnesses.

## 14. Controlled-harness claim ceiling

If Warrant v0 and the frozen attack catalogue pass in the future controlled harness, the maximum claim is:

> Controlled conditional release was runtime-observed under Threat Model T0 across the declared enforcement surfaces.

No stronger authority claim is authorized by this specification alone.

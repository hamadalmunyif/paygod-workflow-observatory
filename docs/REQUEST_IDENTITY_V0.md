# Request Identity v0 and Witness 002b

Status: pre-live-instance boundary. No ACP Job creation is authorized by this work.

## Trust claims after Witness 002

The project distinguishes these claims:

| Claim | Status |
|---|---|
| External observation obtained | PROVEN |
| Observation byte/in-pack integrity | PROVEN |
| Raw -> normalized derivation under the Observatory code | PROVEN when pack verification passes |
| Observation authenticity | NOT PROVEN |
| Request contract extraction | PROVEN |
| Local schema validation | PROVEN |
| Request digest binding | PROVEN LOCALLY |
| Deterministic PayGod decision | PROVEN |
| Decision artifacts produced | PROVEN |
| Independent verification of this live request run | NOT YET PROVEN |
| Request -> ACP instance binding | NOT YET PROVEN |
| Mandatory/non-bypassable release | NOT YET PROVEN |

A manifest proves internal consistency only. It does not authenticate ACP as the source.

## Pack verification boundary

Projection into a PayGod shadow envelope is forbidden until all available pack checks pass:

```text
raw.json
  -> byte length + SHA-256
  -> deterministic re-normalization
normalized.json
  -> canonical SHA-256
manifest.json
  -> internal binding checks
  -> optional external manifest anchor
  -> Projection / Admission
```

Important limitation:

- modifying only `normalized.json` with the old manifest must fail;
- modifying `normalized.json` and recomputing the manifest while leaving `raw.json` unchanged must fail because deterministic re-normalization differs;
- coherently replacing **raw + normalized + manifest** can pass all internal checks;
- such a coherent replacement is classified `CONSISTENT_UNANCHORED` unless a manifest/root digest is pinned outside the pack.

Therefore an external anchor is required to prevent whole-pack replacement. A matching external anchor still does not by itself prove ACP source authenticity.

## Request Identity v0

The semantic request identity is:

```text
H(canonical({
  profile,
  agent_id,
  capability_id,
  capability_name,
  descriptor_digest,
  requirements_digest,
  request_payload_digest
}))
```

The repository exposes this as `workflow-observatory/request-identity/v0`.

### Nonce decision

No nonce is part of Request Identity v0.

Reason:

- a private nonce would prevent independent recomputation;
- a nonce not observed remotely cannot strengthen Request -> Instance binding;
- anti-replay belongs at the later release-receipt/enforcement boundary.

A future correlation nonce may exist as a separately disclosed field. It remains correlation evidence unless it is independently observable in the remote instance.

## Remote binding grades for Witness 003

The following names are frozen before any `create-job` experiment:

- `EXACT_OBSERVED`: the remote instance exposes request evidence that is semantically/canonically equal to the submitted request, but the evidence is observed by our own acquisition path.
- `EXACT_ATTESTED`: exact equality plus evidence independent of the sender/observer, such as a source signature, independent reader, or independently verifiable on-chain commitment.
- `TRANSFORM_OBSERVED`: equality only after a named deterministic transformation profile.
- `TRANSFORM_ATTESTED`: transformed equality plus independent attestation.
- `CORRELATED_ONLY`: job/party/time/field correlation exists but no request identity equality can be established.
- `UNBOUND`: neither equality nor sufficient correlation is available.

The word **bound** must not be used without one of the exact/transform grades.

## Stable adversarial reason codes

Witness 002b requires each case to match its pre-frozen expected code. Examples:

- `PACK_NORMALIZED_DIGEST_MISMATCH`
- `PACK_DERIVATION_MISMATCH`
- `PACK_EXTERNAL_ANCHOR_MISMATCH`
- `ADMISSION_DESCRIPTOR_NOT_FOUND`
- `ADMISSION_PAYLOAD_MISSING`
- `SCHEMA_MAXIMUM`
- `SCHEMA_TYPE_MISMATCH`
- `REQUEST_CAPABILITY_MISMATCH`
- `REQUEST_DESCRIPTOR_DIGEST_MISMATCH`
- `REQUEST_REQUIREMENTS_DIGEST_MISMATCH`
- `REQUEST_PAYLOAD_DIGEST_MISMATCH`

A test that fails for a different reason does not count as a passing adversarial witness.

## Execution boundary

Witness 002b is a prerequisite to Witness 003.

It does not create an ACP Job, fund anything, sign anything, invoke a resource, or authorize execution.

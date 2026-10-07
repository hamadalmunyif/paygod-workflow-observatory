# Post-flight Evidence v0

Status: **DESIGN FROZEN FOR CONTROLLED HARNESS**

Purpose: define the evidence that must exist after each controlled-harness attempt before any conformance or authority result is reported.

The evidence bundle must preserve failures and partial transitions. It must not manufacture success from missing data.

## 1. Required bundle contents

Each attempt produces one immutable evidence directory containing at least:

- `request-identity.json` or an immutable reference to the frozen request artifact;
- `transition-envelope.json` — exact bytes used for transition commitment;
- `warrant-body.json` — exact signed body bytes;
- `warrant.sig`;
- `issuance-audit.json`;
- `authority-state-events.jsonl`;
- `e2-stage.json`;
- `e1-verification.json`;
- `transaction-proposal.json`;
- `transaction-receipt.json` when a transaction exists;
- `instance-binding.json` when a remote instance id can be derived;
- `e2-release.json`;
- `provider-observation.json` when the provider worker receives a payload;
- `conformance.json`;
- `manifest.json`.

Missing files must remain explicitly missing with a reason in `conformance.json`; placeholders must not be fabricated.

## 2. Exact-byte preservation

The bundle preserves the exact bytes needed to recompute:

- request identity commitment;
- transition commitment;
- warrant signature verification;
- payload digest;
- calldata digest.

A parsed representation may be included for readability but may not replace the exact committed artifact.

## 3. Issuance evidence

`issuance-audit.json` records, at minimum:

- canonical PayGod decision artifact digest;
- decision outcome;
- request identity digest;
- transition commitment;
- warrant-body digest;
- issuer key id;
- issuance result;
- declared time source;
- issuance timestamp value observed from that source.

This artifact supports audit linkage.

It is not required by E1/E2 for runtime enforcement.

## 4. Authority-state evidence

`authority-state-events.jsonl` records monotonic S0 transitions.

Each entry includes:

- issuer key id;
- nonce;
- transition commitment;
- prior state;
- new state;
- event type;
- event timestamp under the declared harness time source;
- component requesting the transition;
- success/failure result.

The log is evidence produced by the controlled harness. It is not independent proof of its own authenticity.

## 5. E2 staging evidence

`e2-stage.json` records:

- warrant verification result;
- enforcement domain result;
- transition commitment result;
- payload digest observed by E2;
- expected payload digest;
- content type;
- S0 state before/after;
- exact staged payload artifact reference;
- rejection code when staging fails.

A failed E2 stage means E1 must not be authorized to proceed.

## 6. E1 evidence

`e1-verification.json` records:

- warrant verification result;
- trusted issuer result;
- domain/time result;
- transition commitment result;
- chain/system observed;
- execution account observed;
- target observed;
- calldata digest observed;
- native value observed;
- S0 reservation result;
- rejection code if not authorized.

The execution key itself is never included in the evidence bundle.

## 7. Transaction evidence

If E1 submits a transaction, the bundle must preserve:

- exact transaction proposal visible to E1 before signing/submission;
- transaction hash or user-operation identifier as applicable;
- transaction receipt when available;
- chain id;
- block number/hash or equivalent;
- sender/execution account;
- target;
- transaction input/calldata as observed from the external chain source;
- value;
- emitted instance/job identifier when derivable.

The verifier must compare externally observed execution fields against the preflight Transition Envelope.

## 8. Instance binding

`instance-binding.json` classifies the relationship between the authorized transition and resulting remote instance.

Permitted v0 classifications include:

- `EXACT_EXECUTION_OBSERVED` — externally observed transaction bytes/fields match the authorized transaction surface;
- `INSTANCE_DERIVED_FROM_MATCHING_EXECUTION` — job/instance id is derived from a matching observed execution;
- `CORRELATED_ONLY` — association exists but exact execution binding is not established;
- `NOT_OBSERVED`.

These labels do not independently authenticate the external provider or payload channel.

## 9. E2 release evidence

`e2-release.json` records:

- staged payload digest;
- committed provider/recipient identity;
- transaction/instance evidence consumed by E2;
- transition commitment;
- job/instance context;
- release decision;
- exact bytes released to provider worker;
- S0 state before/after;
- rejection code if release fails.

The released bytes must be the previously staged bytes, not newly supplied client bytes.

## 10. Provider observation

`provider-observation.json` records what the controlled provider worker actually received.

At minimum:

- payload bytes digest;
- content type;
- provider/recipient identity;
- transition/instance context;
- observation timestamp under the declared harness time source.

Because the provider is controlled by us, this is `RUNTIME_OBSERVED` inside the closed harness, not independent external attestation.

## 11. Conformance result

`conformance.json` must produce exactly one top-level outcome:

- `AUTHORIZED_CONFORMANT`
- `REJECTED_PRE_EXECUTION`
- `PARTIAL_TX_ONLY`
- `NONCONFORMANT`
- `BYPASS_OBSERVED`
- `HARNESS_DEFECT`

### AUTHORIZED_CONFORMANT

Requires all of:

- canonical eligible PayGod decision;
- valid issuance;
- valid Warrant;
- E2 payload staged;
- E1 transaction authorized;
- nonce reservation succeeded exactly once;
- externally observed transaction matches the transaction surface;
- resulting instance binding is established at the declared grade;
- E2 releases the exact staged payload;
- provider worker observes the exact released payload;
- no frozen bypass test succeeded.

### REJECTED_PRE_EXECUTION

No protected transaction was executed and the failure occurred before E1 submission.

### PARTIAL_TX_ONLY

A protected transaction exists externally but the payload was not successfully released/accepted under the controlled protocol.

This outcome must never be rewritten as success.

### NONCONFORMANT

External effects exist but one or more committed surfaces do not match the authorized transition.

### BYPASS_OBSERVED

The protected consequential transition was achieved through a route forbidden by T0 or without satisfying required authorization.

This is a decisive failure of the controlled authority hypothesis.

### HARNESS_DEFECT

The test infrastructure failed in a way that prevents a trustworthy conclusion.

A harness defect is not a security pass.

## 12. Manifest

`manifest.json` commits to all produced bundle artifacts by:

- path;
- byte length;
- SHA-256 digest.

The manifest provides bundle integrity only.

It does not prove independent authenticity.

## 13. Independent verification boundary

The first controlled harness may verify its bundle using code separate from E1/E2 execution components.

However, because the environment remains controlled by us, this is not yet Witness 006-level independent external verification.

The result must be described as:

`closed-harness independent-process verification`

unless a genuinely independent verifier boundary is later established.

## 14. Claim boundary

A complete post-flight evidence bundle answers:

- what was authorized;
- what each enforcement surface observed;
- whether the nonce was consumed;
- what external transaction occurred;
- what payload the provider worker received;
- whether those observations conform to the frozen transition.

It does not prove:

- that PayGod's decision was economically correct;
- that the issuer was legally authoritative;
- that an external provider trusts PayGod;
- that the design generalizes beyond the closed harness.

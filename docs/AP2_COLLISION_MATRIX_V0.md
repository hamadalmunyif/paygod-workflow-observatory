# AP2 Collision Matrix v0

Status: **EMPTY EVIDENCE MATRIX — FILL ONLY AFTER RUBRIC FREEZE**

Rubric: `AP2_COLLISION_TEST_RUBRIC_V0.md`

Reviewer:

Review date:

AP2 specification version / commit:

Primary source set:

## Technical axes

| Axis | Score | Primary source | Exact section / clause | Source-supported finding | Material gap? | Notes / ambiguity |
|---|---|---|---|---|---|---|
| 1. Authority Object |  |  |  |  |  |  |
| 2. Binding |  |  |  |  |  |  |
| 3. Issuer ↔ Verifier Separation |  |  |  |  |  |  |
| 4. Replay / Use Semantics |  |  |  |  |  |  |
| 5. Multi-surface Enforcement |  |  |  |  |  |  |
| 6. Post-flight Conformance |  |  |  |  |  |  |

## Axis 7 — Bottleneck / Value Owner

Score:

Primary / first-party evidence:

```text
pain_owner:
failure_or_compliance_cost:
current_workaround:
control_point_owner:
internal_buildability:
external_supplier_acceptability:
likely_buyer:
observed_budget_or_resource_commitment:
```

Commercial interpretation:

## Derived result

```text
technical_coverage_vector:
covered_count:
warrant_originality_status: WATCH | REJECT
mapping_status: CLEAN | PARTIAL | OVERFIT
enforceability_status: ENFORCEABLE | DESCRIPTIVE_ONLY | UNKNOWN
commercial_status: NO_SIGNAL | WEAK_SIGNAL | BEHAVIORAL_SIGNAL | RESOURCE_COMMITMENT | UNKNOWN
```

## Kill Rule calculation

List the number of Axes 1–6 scored `COVERED`.

For every remaining axis, classify the gap using the frozen Material-gap rule.

Do not change the Kill Rule after seeing AP2 results.

## PayGod core-change check

Record whether a successful mapping would require any change to:

- Warrant v0 fields/semantics;
- Transition Envelope v0 semantics;
- request identity meaning;
- Decision → Warrant issuance eligibility;
- S0 replay/consumption;
- no-policy-rerun enforcer rule;
- conformance semantics.

If yes, identify the exact required change and set mapping status accordingly.

## Adapter-laundering check

For each proposed mapping operation, classify it:

- source parse;
- exact preservation;
- deterministic projection;
- field-name/transport translation;
- new authority meaning;
- new replay state;
- new cross-surface binding;
- new conformance assertion.

Any of the last four must be treated under the forbidden-adapter rules.

## Independent review

### Pass A

Scores:

Reviewer notes:

### Pass B

Scores:

Reviewer notes:

### Reconciliation

For each disagreement:

| Axis | Pass A | Pass B | Source clause in dispute | Reconciled score | Reason |
|---|---|---|---|---|---|

## Final claim boundary

The final report must separately state:

- what AP2 already covers;
- what AP2 partially covers;
- what AP2 does not cover;
- what AP2 explicitly leaves out of scope;
- what remains unknown;
- what, if anything, remains a PayGod hypothesis;
- what remains commercially unproven.

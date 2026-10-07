# AP2 Collision Test — Pass B Handoff v0

Status: **READY FOR BLIND SECOND-PASS REVIEW**

Amendment note: this handoff was neutralized after methodology review. The underlying frozen rubric was not changed.

Purpose: obtain an independent AP2 Collision Test score without contaminating the second reviewer with Pass A conclusions.

## 1. Reviewer instructions

Before scoring, read only:

- `AP2_COLLISION_TEST_RUBRIC_V0.md`
- `AP2_COLLISION_MATRIX_V0.md`
- the pinned AP2 primary sources listed below

Do **not** read:

- `AP2_COLLISION_PASS_A_V0.md`
- `AP2_ISSUE_HYPOTHESIS_REGISTER_V0.md`

until after all six technical axes have been independently scored and written down.

The purpose is to preserve a genuine second pass rather than a critique of Pass A.

The second reviewer must not receive any verbal summary of Pass A before freezing the six technical scores.

## 2. Frozen AP2 source set

Repository:

`google-agentic-commerce/AP2`

Pinned commit:

`e1ea56db72a6385bce3e5c1112b3a56ce60acb43`

Specification version:

`v0.2`

Primary files:

- `docs/ap2/specification.md`
- `docs/ap2/agent_authorization.md`
- `docs/ap2/checkout_mandate.md`
- `docs/ap2/payment_mandate.md`
- `code/sdk/schemas/ap2/checkout_mandate.json`
- `code/sdk/schemas/ap2/payment_mandate.json`
- `code/sdk/schemas/ap2/checkout_receipt.json`
- `code/sdk/schemas/ap2/payment_receipt.json`
- `code/sdk/schemas/ap2/types/receipt_status.json`

Do not silently substitute newer source text during this Pass B.

If the reviewer believes a newer AP2 source materially changes an answer, record it separately as:

`VERSION_DRIFT_OBSERVED`

and complete the pinned-source score first.

## 3. Required output

Score each technical axis using only:

- `COVERED`
- `PARTIAL`
- `NOT COVERED`
- `OUT OF SCOPE`
- `UNKNOWN`

Axes:

1. Authority Object
2. Binding
3. Issuer ↔ Verifier Separation
4. Replay / Use Semantics
5. Multi-surface Enforcement
6. Post-flight Conformance

For every score, provide:

- exact primary file;
- exact section/heading/schema;
- source-supported finding;
- why it meets/fails the frozen minimum;
- whether any remaining gap is material under the frozen material-gap rule.

Do not use repository issues to justify the first-pass score.

## 4. Commercial Axis 7

After the six technical scores are frozen, score:

7. Bottleneck / Value Owner

Use the same five labels only as research shorthand.

Do not infer demand from protocol architecture.

If no first-party behavioral/commercial evidence is available, use:

`UNKNOWN`

rather than guessing who would pay.

## 5. Neutral adversarial review rule

Pass B must not be directed toward any preselected axis.

For **each of Axes 1–6**, the reviewer must make both cases before choosing a score:

1. strongest source-grounded case that AP2 **covers** the frozen minimum;
2. strongest source-grounded case that AP2 **does not fully cover** the frozen minimum.

The reviewer may downgrade or upgrade **any** axis with equal standing.

No axis is designated as the expected source of disagreement.

The reviewer must not be told:

- Pass A's scores;
- Pass A's covered-count;
- which axes Pass A considered pivotal;
- what score change would trigger the Kill Rule in the existing Pass A vector.

The frozen rubric itself remains visible, including its derived-result rules.

### Normative semantics versus implementation mechanism

Coverage is judged at the specification/protocol level.

Do not mark an axis `PARTIAL` merely because AP2 leaves an implementation mechanism local.

For example, a specification can fully define a required replay outcome while allowing each Verifier to choose its own database, cache, ledger, or atomic-storage implementation.

The relevant distinction is:

- **normative semantic exists** — the protocol says what must be accepted/rejected/bounded; implementation mechanics may remain local;
- **normative semantic absent or optional** — the protocol does not require the relevant safety property, even if an implementation could add it locally.

Likewise, an implementation bug does not lower a normative protocol score when the specification clearly requires the missing behavior; record that separately as `IMPLEMENTATION_CONFORMANCE_GAP`.

## 6. Freeze-before-issues checkpoint

Before reading any AP2 issue/discussion, the reviewer must record:

```text
axis_1:
axis_2:
axis_3:
axis_4:
axis_5:
axis_6:
technical_coverage_vector:
covered_count:
warrant_originality_status:
mapping_status:
enforceability_status:
```

Only then may the reviewer inspect the issue register or repository issues.

## 7. Issue phase

After the technical scores are frozen, the reviewer may read:

`AP2_ISSUE_HYPOTHESIS_REGISTER_V0.md`

and current issue discussions.

Issues may:

- test a source interpretation;
- expose implementation/spec divergence;
- identify version drift;
- generate future experiments.

Issues may not retroactively become normative evidence.

If an issue reveals that the pinned implementation violates the spec, preserve the protocol score and record:

`IMPLEMENTATION_CONFORMANCE_GAP`

unless the primary normative text itself is ambiguous/missing.

## 8. Reviewer-independence declaration

Before returning scores, record exactly one reviewer class:

- `EXTERNAL_HUMAN_DOMAIN_REVIEWER` — human outside the PayGod build/research loop with relevant protocol/payments/authorization expertise;
- `INTERNAL_HUMAN_REVIEWER` — human already participating in PayGod decisions;
- `AI_SECOND_PASS` — another model/session performing a blind source review;
- `MIXED_OR_ASSISTED` — human review materially assisted by a model or by PayGod participants.

Only `EXTERNAL_HUMAN_DOMAIN_REVIEWER` counts as external independent validation.

The other classes remain useful second-pass evidence but must not be described as independent external verification.

The review result must state whether the reviewer had any prior exposure to Pass A conclusions.

## 9. Independent result format

Return:

```text
PASS_B

reviewer_class:
prior_exposure_to_pass_a: YES | NO

source_commit:
spec_version:

technical_coverage_vector:
  axis_1:
  axis_2:
  axis_3:
  axis_4:
  axis_5:
  axis_6:

covered_count:

warrant_originality_status:
mapping_status:
enforceability_status:

axis_7:
commercial_status:

kill_rule_triggered: YES | NO

material_gaps:
- ...

version_drift:
- ...

implementation_conformance_gaps:
- ...

strongest_case_against_paygod:
...

strongest_remaining_paygod_hypothesis:
...

confidence:
...
```

## 10. Reconciliation rule

After Pass B is complete, compare it to Pass A.

For each disagreement:

- preserve Pass A score;
- preserve Pass B score;
- identify exact source clause;
- write why each reviewer interpreted it differently;
- reconcile only from the frozen rubric and pinned primary source.

Do not change the rubric to make the disagreement disappear.

## 11. Stop conditions

Stop and mark the relevant result `UNKNOWN` if:

- source text is contradictory;
- required normative details are inaccessible;
- a conclusion depends on unpublished assumptions;
- the reviewer would need an adapter implementation to know the answer.

Do not extend the research indefinitely to avoid an unfavorable result.

## 12. Final boundary

Pass B is not a product review and not a recommendation to adopt PayGod.

Its job is narrower:

> independently determine how much of the frozen PayGod authority hypothesis AP2 v0.2 already covers, and whether the remaining difference is material.


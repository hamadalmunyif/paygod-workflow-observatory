# AP2 Collision Test — Precommitted Outcome / Reaction Matrix v0

Status: **FROZEN BEFORE PASS B RESULT**

Purpose: prevent post-result reinterpretation of the AP2 Collision Test.

This document does not change `AP2_COLLISION_TEST_RUBRIC_V0.md` or its Kill Rule.

It freezes what PayGod will do after Pass B and reconciliation.

## 1. Decision source

Actions below are based on the **reconciled six-axis technical vector**, not on Pass A or Pass B alone.

A disagreement is not resolved by majority vote. It is reconciled from the frozen rubric and pinned primary source.

## 2. Core reaction rule

### Case R0 — all six technical axes COVERED

Action:

- set `WARRANT_AS_INDEPENDENT_ORIGINAL_PRIMITIVE = REJECT`;
- stop originality claims for Warrant v0;
- do not rename the same primitive and continue the claim;
- keep Warrant code only as compatibility/reference implementation if useful;
- any new PayGod thesis must start separately at `WATCH`.

### Case R1 — five axes COVERED, one remaining material gap

Action:

- keep Warrant originality at `WATCH`, not PROVEN;
- narrow the surviving technical hypothesis to the single material gap;
- do not describe the other five covered functions as PayGod differentiation;
- do not build an AP2-specific product around the remaining gap until Axis 7 produces at least behavioral evidence of a pain owner.

### Case R2 — four axes COVERED, two remaining material gaps

Action:

- keep Warrant originality at `WATCH`;
- narrow differentiation to those material gaps only;
- prohibit broader “authority protocol” originality claims;
- require independent market evidence before turning either remaining gap into a product thesis.

### Case R3 — fewer than four axes COVERED

Action:

- Kill Rule does not trigger;
- Warrant originality remains `WATCH`, not PROVEN;
- record the broader technical differentiation;
- require prior-art review beyond AP2 before any originality claim;
- do not infer market demand from weaker AP2 overlap.

## 3. Explicit score-change cases

These reactions are frozen regardless of which reviewer produced the change.

### Only Axis 4 upgrades to COVERED

If Axis 6 remains a material `PARTIAL`:

- result remains `WATCH`;
- surviving AP2-relative hypothesis becomes **post-flight conformance only**;
- do not build a conformance product until a real ecosystem actor identifies the pain and control point.

### Only Axis 6 upgrades to COVERED

If Axis 4 remains a material `PARTIAL`:

- result remains `WATCH`;
- surviving AP2-relative hypothesis becomes **replay/use-state semantics only**;
- do not market this as a general Warrant originality claim.

### Axes 4 and 6 both upgrade to COVERED

With the current Pass A vector, this would produce six covered axes.

Reaction:

- trigger `REJECT` for Warrant-as-independent-original-primitive.

### Any currently COVERED axis is downgraded

Reaction:

- preserve the downgrade if reconciliation supports it;
- do not treat the downgrade as proof that PayGod is original;
- expand the remaining-difference analysis to that axis;
- require broader prior-art search before any originality claim;
- retain market status at `WATCH` / `UNKNOWN` unless independent demand evidence exists.

### One or more axes become UNKNOWN or OUT OF SCOPE

Reaction:

- do not force a favorable interpretation;
- Kill Rule applies only according to the frozen rubric;
- unresolved axes remain unresolved;
- no originality claim may be promoted from uncertainty.

## 4. “AP2 does not require” versus “AP2 does not prevent”

This distinction is frozen for reconciliation.

A local implementation choice is **not** a protocol gap merely because AP2 does not standardize the storage/mechanism.

Example:

- if AP2 normatively requires a Verifier to reject an already-consumed authority, but leaves the database/ledger implementation local, the replay semantic may still be `COVERED`;
- if AP2 merely permits a Verifier to reject duplicates, or relies on an Agent not to resubmit, the portable normative safety property is not fully specified and may be `PARTIAL`.

The score is about required protocol semantics, not whether AP2 standardizes SQLite/HSM/ledger internals.

The same rule applies to other axes: implementation freedom is not absence of semantics.

## 5. Implementation defects

If the AP2 SDK/sample violates clear normative AP2 requirements:

- record `IMPLEMENTATION_CONFORMANCE_GAP`;
- do not lower the normative protocol score solely because of the bug;
- do not promote PayGod originality from a reference-implementation defect.

If the implementation behavior reveals genuine normative ambiguity, score from that ambiguity under the frozen rubric.

## 6. Commercial reaction — Axis 7

### Axis 7 UNKNOWN / NO_SIGNAL

Action:

- no AP2-derived product build;
- no `Invest`;
- technical findings remain research hypotheses.

### WEAK_SIGNAL

Action:

- continue behavioral interviews;
- no product commitment.

### BEHAVIORAL_SIGNAL

Requires observed past behavior/pain, not hypothetical interest.

Action:

- define one external validation experiment around the surviving material gap;
- still no `Invest` classification.

### RESOURCE_COMMITMENT

Examples:

- engineer time assigned;
- sandbox/integration access;
- paid discovery/pilot;
- concrete procurement/security review effort.

Action:

- surviving technical hypothesis may move to a bounded external prototype;
- investment judgment still depends on portability/value-capture evidence, not one adopter alone.

## 7. Portability reaction remains separate

The AP2 Collision Test cannot prove PayGod portability.

Even if a material gap survives, the portability criterion remains:

> two independent enforcers accept the same authority protocol/semantics without rerunning PayGod evidence/policy internally.

One adopter is integration evidence, not portability proof.

If two independent enforcers both require re-deciding authority internally, portable authority is downgraded to `REJECT` for that tested market boundary.

## 8. Gate Zero remains independent

The local Gate Zero / E1 / E2 engineering track continues under its existing threat-model claims regardless of AP2 collision outcome.

A local harness success proves implementability under T0.

It does not rescue Warrant originality if the AP2 Kill Rule triggers.

Likewise, AP2 overlap does not invalidate the value of the local falsification harness as a reference implementation.

## 9. No narrative rescue rule

After Pass B:

- do not move the goalposts;
- do not redefine a killed Warrant claim as a “new” primitive with the same semantics;
- do not turn a technical gap into a product without Axis 7 evidence;
- do not turn an implementation bug into protocol differentiation;
- do not call `WATCH` a success.

The acceptable result may be that AP2 already covers most of the authority layer and PayGod's remaining value is narrower or purely evidentiary.

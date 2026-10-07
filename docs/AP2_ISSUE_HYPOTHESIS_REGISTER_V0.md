# AP2 Issue Hypothesis Register v0

Status: **PASS A REGISTER — ISSUES ARE HYPOTHESIS GENERATORS ONLY**

Rubric: `AP2_COLLISION_TEST_RUBRIC_V0.md`

AP2 pinned source commit for Pass A:

`e1ea56db72a6385bce3e5c1112b3a56ce60acb43`

Last checked:

`2026-10-07`

No issue below directly determines an AP2 coverage score.

## Issue #346

| Field | Value |
|---|---|
| issue_number | 346 |
| title | Verifiers never consume an accepted closed Payment Mandate; one user consent can be redeemed for multiple payments |
| opened_date | 2026-09-02 |
| current_state | OPEN |
| maintainer_response | No public maintainer response observed in the issue/comments fetched. Reporter states the security team classified it as intended behavior for program purposes and invited a public issue; that statement is reporter-supplied, not treated as maintainer evidence here. |
| resolution_or_status | Unresolved in pinned AP2 main. A proposed fix is described by the reporter; no merged normative fix was used in Pass A. |
| specification_section_implicated | Autonomous mode; Verification; Agent Authorization → Action Authorization; Payment Mandate → recurrence/budget |
| hypothesis_generated | A valid accepted closed Payment Mandate may lack mandatory verifier-side atomic consume semantics, allowing repeated authorization/execution despite valid signatures. |
| normative_text_result | CONFIRMS the narrower hypothesis that v0.2 lacks a universal mandatory closed-Mandate consume rule. The specification contains agent-side non-representation rules and recurrence/budget state, but Pass A found no generic verifier MUST-consume rule. |
| axis_implicated | Axis 4 — Replay / Use Semantics |
| notes | Used only to target primary-source review. Pass A score comes from the normative text, not this issue reproduction. |

## Issue #327

| Field | Value |
|---|---|
| issue_number | 327 |
| title | Payment receipt `Success` can be issued without payment-rail success evidence |
| opened_date | 2026-08-10 |
| current_state | OPEN |
| maintainer_response | No maintainer-confirmed resolution observed. Discussion contains third-party analysis and a proposed PR #335 adding a `rail_confirmation_verified` concept. |
| resolution_or_status | Open. PR #335 was referenced in discussion; it was not part of the pinned Pass A source commit. |
| specification_section_implicated | Payment Receipt schema; Dispute Evidence; Verification → Dispute |
| hypothesis_generated | A signed AP2 Payment Receipt may bind a success claim to a Mandate without requiring independently verified evidence that the underlying payment rail actually succeeded. |
| normative_text_result | CONFIRMS the narrower normative gap used by Pass A: receipt schema requires PSP/network confirmation IDs for success, but the reviewed dispute rules do not require independent validation of those confirmations against rail state/finality. |
| axis_implicated | Axis 6 — Post-flight Conformance |
| notes | The issue's implementation reproduction is not used as protocol proof. Primary-source receipt/dispute rules drive the PARTIAL score. |

## Issue #328

| Field | Value |
|---|---|
| issue_number | 328 |
| title | Payment mandate checkout binding depends on optional verifier context |
| opened_date | 2026-08-10 |
| current_state | OPEN |
| maintainer_response | No public comments/maintainer response observed. |
| resolution_or_status | Open implementation/SDK concern at time checked. |
| specification_section_implicated | Payment Mandate binding; Verification → Credential Provider/Network/MPP |
| hypothesis_generated | The Python SDK may fail to enforce closed Payment Mandate → Checkout binding when expected context is omitted. |
| normative_text_result | CONTRADICTS any claim that AP2 v0.2 lacks the binding normatively. The specification explicitly binds Payment Mandate to Checkout and requires relevant verification. The issue therefore remains an implementation-conformance hypothesis, not a protocol-coverage gap. |
| axis_implicated | Axis 2 — Binding |
| notes | Does not downgrade Axis 2 from COVERED. |

## Issue #331

| Field | Value |
|---|---|
| issue_number | 331 |
| title | Merchant sample verifies checkout using embedded JWT without independent checkout-hash context |
| opened_date | 2026-08-11 |
| current_state | OPEN |
| maintainer_response | No public comments/maintainer response observed. |
| resolution_or_status | Open sample/SDK concern at time checked. |
| specification_section_implicated | Checkout Mandate; Verification → Merchant |
| hypothesis_generated | A merchant implementation may validate data embedded in the Mandate rather than compare against the merchant's independently created Checkout context. |
| normative_text_result | CONTRADICTS any protocol-gap claim: AP2 v0.2 normatively requires Merchant verification of the Checkout JWT hash against `checkout_hash`. This is therefore tracked as implementation conformance. |
| axis_implicated | Axis 2 — Binding |
| notes | Does not downgrade Axis 2 from COVERED. |

## Issue #358

| Field | Value |
|---|---|
| issue_number | 358 |
| title | Closed Checkout Mandate binding not enforced by CheckoutMandateChain.verify |
| opened_date | 2026-09-17 |
| current_state | OPEN |
| maintainer_response | No maintainer-authorized resolution observed. Four public comments were reviewed; an independent party reproduced the issue and the reporter linked PR #359 with regression tests/fix work. |
| resolution_or_status | Open. PR #359 was independently tested in discussion but was not part of pinned Pass A main. |
| specification_section_implicated | Checkout Mandate `checkout_hash`; Verification → Merchant; Verification → Dispute |
| hypothesis_generated | Current SDK chain verification may omit a mandatory normative Checkout binding check. |
| normative_text_result | CONTRADICTS a normative-protocol-gap hypothesis and supports an implementation-conformance hypothesis: the specification explicitly requires hashing the Checkout JWT and comparing it to `checkout_hash`. |
| axis_implicated | Axis 2 — Binding |
| notes | The independent reproduction is useful for future implementation tests, not for lowering AP2's normative coverage score. |

## Register conclusions for Pass A

The issues divide into two classes.

### Protocol-semantic hypotheses still material

- #346 → replay / consume-once semantics;
- #327 → independent grounding of post-flight payment success.

These correspond to the two `PARTIAL` Pass A axes.

### Implementation-conformance hypotheses

- #328;
- #331;
- #358.

These indicate that reference SDK/sample behavior may fail to implement normative binding correctly. They do not make AP2's normative binding axis `PARTIAL` because the frozen Collision Test scores protocol coverage separately from implementation bugs.

## Rules retained

1. Issue state does not determine truth.
2. Reporter claims are not maintainer decisions.
3. Pull requests are not merged protocol semantics until they are in the pinned source set.
4. Reproduction can establish implementation behavior but not rewrite the normative specification.
5. If Pass B finds stronger primary-source text, the axis score changes through review/reconciliation, not through this register.

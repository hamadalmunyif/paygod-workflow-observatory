# AP2 Collision Test Rubric v0

Status: **FROZEN BEFORE CURRENT AP2 PRIMARY-SOURCE REVIEW**

Purpose: determine whether AP2 duplicates, partially overlaps, complements, or falsifies the current PayGod Warrant/authority hypothesis.

This is a collision test, not an integration exercise.

No AP2 adapter, implementation, or product claim is authorized by this document.

## 1. Research question

Does current AP2 already provide the authority semantics that PayGod Warrant v0 claims to add, and if not, what remains materially distinct?

The test must separate:

- prior-art / primitive overlap;
- descriptive mapping;
- actual enforcement;
- post-flight conformance;
- commercial ownership of any remaining gap.

## 2. Primary-source rule

Technical judgments must be grounded in AP2 primary sources only:

- current normative specification;
- current normative schemas/protocol documents;
- official reference documentation where the specification delegates details;
- official repository source only when needed to resolve normative ambiguity.

Secondary articles, summaries, social posts, and commentary may not determine a coverage score.

Repository issues may generate hypotheses only. They may not change a score without support from normative text or confirmed implementation evidence.

## 3. Allowed result vocabulary

Every axis receives exactly one of:

- `COVERED`
- `PARTIAL`
- `NOT COVERED`
- `OUT OF SCOPE`
- `UNKNOWN`

### COVERED

Use only when current AP2 primary sources define the relevant mechanism sufficiently to perform the axis function without requiring a new independent authority primitive.

For a technical axis, examples, optional prose, or an extensibility hook alone are insufficient unless the normative protocol defines the required semantics.

### PARTIAL

Use when AP2 defines a material subset of the function but at least one required property below is absent, delegated, optional in a way that breaks the claim, or depends on a new non-standard mechanism.

### NOT COVERED

Use when the primary sources contain no mechanism performing the required function, or define a mechanism that does not satisfy the frozen minimum criteria.

Absence must not be inferred from a search miss alone. The reviewer must identify the relevant specification area and explain why it does not provide the function.

### OUT OF SCOPE

Use only when AP2 primary sources explicitly place the relevant function outside AP2's scope or delegate it to another protocol/system.

This is not equivalent to `NOT COVERED`.

### UNKNOWN

Use when the available primary sources are insufficient, ambiguous, contradictory, inaccessible, or leave the behavior implementation-defined.

Unknowns must remain unknown; do not resolve them from model knowledge or assumption.

## 4. Evidence required for every score

Each axis row must include:

- exact primary source;
- section / heading / schema / normative clause;
- short source-supported finding;
- score;
- rationale tied to the frozen minimum criteria;
- unresolved ambiguity, if any.

A score without a primary-source anchor is invalid.

## 5. Axis 1 — Authority Object

Question:

> Does AP2 define a verifiable object that grants or represents authority for a consequential action?

### COVERED minimum

All must be supported:

1. object is explicit and identifiable;
2. object is bound to an issuer/authorizer identity or trust context;
3. integrity/authenticity is verifiable;
4. object constrains a consequential action or class of action;
5. downstream verifier can decide acceptance from the object plus its declared trust/configuration;
6. authority semantics are not merely descriptive metadata.

### PARTIAL triggers

Examples:

- signed intent exists but is not sufficient for authorization;
- object authenticates user intent but not the consequential action;
- authority exists only as local participant state;
- object is advisory and verifier may ignore it without violating protocol semantics.

## 6. Axis 2 — Binding

Question:

> How precisely is authority bound to the action that may occur?

### COVERED minimum

The protocol must bind all AP2 execution-relevant dimensions necessary to distinguish the authorized action from a materially different one.

At minimum the review must determine whether binding covers, where applicable:

- actor / subject;
- counterparty / merchant / recipient;
- action or order contents;
- amount / value / limits;
- credential or payment instrument context;
- relevant validity constraints;
- identifier/commitment that prevents substitution of a materially different action.

A binding may be structured rather than byte-exact. The score concerns semantic protection, not whether AP2 uses PayGod's byte profile.

### PARTIAL triggers

- intent is bound but final execution can materially differ without a new authorization;
- payment is bound but commerce/order semantics are not;
- multiple objects carry related bindings without a normative rule proving they refer to the same authorized action.

## 7. Axis 3 — Issuer ↔ Verifier Separation

Question:

> Can authority be issued by one trust role and enforced/verified by another without the enforcer rerunning the issuer's underlying decision process?

### COVERED minimum

All must hold:

1. issuer/authorizer and verifier/enforcer are distinct protocol roles or may be distinct actors;
2. verifier has a defined trust rule for accepting the authority object;
3. verifier does not need to reconstruct the issuer's private policy/evidence reasoning;
4. issuer identity/trust is not inferred solely from self-asserted producer metadata;
5. rejection on invalid/untrusted authority is part of the protocol semantics.

### PARTIAL triggers

- roles are distinct but verifier must repeat the policy decision;
- verifier trusts a platform-local assertion rather than portable authority;
- separation exists only for one fixed ecosystem actor and cannot be independently configured.

## 8. Axis 4 — Replay / Use Semantics

Question:

> Does AP2 prevent or bound unintended reuse of authority?

### COVERED minimum

Primary sources must define enough semantics to determine whether an authority object is:

- single-use, multi-use, or explicitly reusable;
- time-bounded where relevant;
- protected against replay/substitution in its intended context;
- consumed or otherwise made distinguishable after authorized use where single-use is required.

If the protocol intentionally allows reuse under explicit constraints, that may still be `COVERED` if the use semantics are complete and verifiable.

### PARTIAL triggers

- expiry exists but no use/replay semantics;
- identifier exists but no normative duplicate-use behavior;
- replay is left entirely to participant-local implementation without portable semantics.

## 9. Axis 5 — Multi-surface Enforcement

Question:

> When one business transition spans multiple consequential surfaces/actors, does AP2 normatively bind and enforce those surfaces as one authority-consistent transition?

### COVERED minimum

The protocol must show:

1. more than one consequential verification/execution surface where the flow requires it;
2. a normative binding that lets each relevant verifier know which authority/action it is enforcing;
3. a mismatch on one surface cannot be silently treated as the same authorized transition;
4. the enforcement relationship is more than descriptive correlation.

A protocol with only one consequential surface may be `OUT OF SCOPE` for multi-surface enforcement if the specification clearly does not model such a transition. It must not receive `COVERED` merely because the test is easier.

### PARTIAL triggers

- multiple signed objects exist but cross-object binding is incomplete;
- multiple parties verify independently without a common transition relation;
- one surface is normative and another is application-defined.

## 10. Axis 6 — Post-flight Conformance

Question:

> After execution, can an independent verifier determine whether the consequential outcome matched what was authorized?

### COVERED minimum

Primary sources must define evidence sufficient to compare:

- authorized action/constraints;
- observed executed action/outcome;
- identity of relevant participants;
- result/receipt state;

and determine conformance or non-conformance without relying only on the executor's unverified assertion.

The mechanism may use receipts, attestations, protocol state, or externally verifiable records.

### PARTIAL triggers

- receipt proves that something happened but not that it matched the authorization;
- receipt is signed but lacks sufficient action binding;
- dispute evidence exists without a normative conformance relation;
- verification requires inaccessible private state.

## 11. Axis 7 — Bottleneck / Value Owner

This axis is commercial and receives the same five labels only as a research shorthand; it is not counted in the six-axis technical Kill Rule.

Question:

> If a technical gap remains, who experiences its cost today, who controls the point where it could be solved, and can that actor absorb it internally?

Every finding must attempt to identify:

- `pain_owner`
- `failure_or_compliance_cost`
- `current_workaround`
- `control_point_owner`
- `internal_buildability`
- `external_supplier_acceptability`
- `likely_buyer`
- `observed_budget_or_resource_commitment`

### COVERED meaning for Axis 7

There is primary/first-party evidence that the ecosystem already has an identified owner and mechanism for the bottleneck such that PayGod's proposed independent layer is substantially absorbed.

### PARTIAL

A pain/control owner is identifiable, but external-supplier willingness or economic value is unproven.

### NOT COVERED

A technical gap exists but no identifiable actor currently owns, pays for, or prioritizes it.

### OUT OF SCOPE

The AP2 technical specification explicitly cannot answer the commercial question; this will usually require interviews.

### UNKNOWN

Insufficient behavioral evidence.

No commercial status may move to `Invest` from specification analysis alone.

## 12. Material-gap rule

A remaining technical gap is **material** only if satisfying it would require at least one of:

- a new signed/attested authority or evidence object;
- a new verifier/enforcer trust relationship;
- a new persistent cross-party state or replay/consumption mechanism;
- a new normative cross-object or cross-surface binding;
- a new independently verifiable post-flight artifact;
- a new enforcement decision that can reject a consequential action.

A gap is **non-material for the Warrant originality claim** if it can be filled solely by:

- local logging;
- UI metadata;
- an implementation-private database field;
- a non-normative adapter annotation;
- a merchant-local rule that requires no protocol participant or trust-boundary change.

## 13. Adapter-laundering guardrail

The Collision Test is invalid if an adapter is allowed to manufacture the missing semantics.

### Allowed adapter behavior

An eventual adapter MAY:

- parse AP2-defined objects;
- preserve exact source objects;
- extract AP2-defined identities/constraints;
- compute hashes/commitments over existing objects;
- translate transport/field names;
- attach references to already-existing PayGod artifacts;
- perform deterministic projection with no new authority meaning.

### Forbidden adapter behavior for a "clean portability" result

An adapter MUST NOT be credited as AP2 coverage if it:

- creates a new authority decision absent from AP2;
- invents a new replay/consumption state to repair AP2;
- creates a new cross-surface binding AP2 does not require;
- asks an enforcer to trust a new PayGod-only field to make AP2 safe;
- reruns PayGod evidence/policy inside the enforcer;
- synthesizes post-flight conformance that AP2 cannot independently support;
- changes Warrant v0 fields/semantics;
- changes Transition Envelope v0 fields/semantics;
- changes the canonical PayGod decision rules merely to fit AP2.

If any forbidden behavior is necessary, the relevant axis cannot be scored `COVERED` on the basis of the adapter.

## 14. Core-change definition

For this Collision Test, a change to any of the following counts as a PayGod core change:

- Warrant v0 logical fields or trust semantics;
- Transition Envelope v0 logical binding semantics;
- request identity meaning;
- Decision → Warrant issuance eligibility semantics;
- S0 replay/consumption semantics;
- requirement that enforcers do not rerun PayGod evidence/policy;
- conformance outcome semantics.

A transport adapter, parser, projection, or AP2-specific identifier mapping is not a core change if it preserves all of the above.

## 15. Derived result rules

The test does **not** produce one subjective label.

It produces:

### A. Technical coverage vector

Six ordered scores for Axes 1–6.

### B. Warrant originality status

`REJECT` if:

1. at least four of Axes 1–6 are `COVERED`; and
2. every remaining non-covered axis is either:
   - non-material under Section 12, or
   - already satisfiable using AP2-standard objects/roles without a new independent authority layer.

Otherwise:

`WATCH`

`WATCH` is not proof of originality.

### C. Mapping status

- `CLEAN` — mapping requires no core change and no forbidden adapter behavior;
- `PARTIAL` — some semantics map, but one or more material gaps remain;
- `OVERFIT` — making the mapping work requires a PayGod core change or adapter-laundered semantics.

### D. Enforceability status

- `ENFORCEABLE` — primary sources define a consequential reject/accept point for the mapped authority;
- `DESCRIPTIVE_ONLY` — objects can be mapped but no normative enforcement point is established;
- `UNKNOWN`.

### E. Commercial status

- `NO_SIGNAL`
- `WEAK_SIGNAL`
- `BEHAVIORAL_SIGNAL`
- `RESOURCE_COMMITMENT`
- `UNKNOWN`

Specification reading alone can produce at most `UNKNOWN` or `WEAK_SIGNAL`.

## 16. Kill Rule

The Warrant-as-independent-original-primitive hypothesis is killed when Section 15.B yields `REJECT`.

On Kill Rule activation:

- stop originality claims for Warrant v0;
- do not rename the same primitive and continue the claim;
- preserve implementation only if useful as compatibility/reference code;
- evaluate any remaining hypothesis independently, especially:
  - evidence-before-authorization;
  - multi-surface enforcement;
  - post-flight conformance.

A surviving remaining hypothesis starts at `WATCH`, not `PROVEN`.

## 17. Independent review protocol

The matrix requires two passes.

### Pass A

Primary reviewer fills:

- evidence citations;
- axis scores;
- rationale;
- unknowns;

without seeing the second review.

### Pass B

Second reviewer independently scores the same frozen rubric.

### Reconciliation

For every disagreement:

- preserve both original scores;
- identify the exact source clause causing disagreement;
- record the reconciled score only after discussion;
- do not change this rubric to resolve a difficult result.

Rubric changes after source review begins require:

- version bump;
- explicit deviation note;
- rerun of all affected axes.

## 18. Issue handling

Every AP2 repository issue used in this research must be entered into a separate hypothesis register with:

- issue number;
- title;
- opened date;
- current open/closed state;
- maintainer response/status;
- specification section implicated;
- hypothesis generated;
- whether normative text confirms, contradicts, or leaves it unknown.

An issue never directly sets an axis score.

## 19. Time box

Primary-source Collision Test target:

- 2–3 research days;
- no live AP2 adapter during this phase;
- no x402 expansion during this phase.

If the source set is too ambiguous for a score, use `UNKNOWN` rather than extending the test indefinitely.

## 20. Claim boundary

A completed AP2 Collision Test may establish only:

- how current AP2 primary sources overlap with the frozen PayGod authority hypothesis;
- whether Warrant originality survives the frozen Kill Rule;
- whether a clean descriptive/enforcement mapping appears possible;
- which gaps remain technical versus commercial hypotheses.

It does not establish market demand, portability across two independent enforcers, or production-grade external authority.

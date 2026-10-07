# AP2 Collision Test — Pass A v0

Status: **PRIMARY REVIEW COMPLETE — NOT FINAL**

Rubric: `AP2_COLLISION_TEST_RUBRIC_V0.md`

Reviewer: PayGod research pass A

Review date: 2026-10-07

## 1. Frozen AP2 source set

Repository:

`google-agentic-commerce/AP2`

Pinned review commit:

`e1ea56db72a6385bce3e5c1112b3a56ce60acb43`

AP2 specification version:

`v0.2`

Primary technical sources reviewed:

- `docs/ap2/specification.md`
- `docs/ap2/agent_authorization.md`
- `docs/ap2/checkout_mandate.md`
- `docs/ap2/payment_mandate.md`
- `code/sdk/schemas/ap2/checkout_mandate.json`
- `code/sdk/schemas/ap2/payment_mandate.json`
- `code/sdk/schemas/ap2/checkout_receipt.json`
- `code/sdk/schemas/ap2/payment_receipt.json`
- `code/sdk/schemas/ap2/types/receipt_status.json`

Repository issues are recorded separately in `AP2_ISSUE_HYPOTHESIS_REGISTER_V0.md` and do not determine the scores below.

## 2. Pass A technical matrix

| Axis | Pass A score | Primary source / section | Source-supported finding | Material gap? |
|---|---|---|---|---|
| 1. Authority Object | **COVERED** | `agent_authorization.md` → Mandate Structure, Action Authorization; `specification.md` → Mandates | Mandates are cryptographically verifiable authorization objects. Closed Mandates are bound to a particular transaction with a Verifier; Verifiers verify integrity and that the content authorizes the requested action. | No material gap identified for the authority-object function itself. |
| 2. Binding | **COVERED** | `specification.md` → Checkout Mandate, Payment Mandate, Verification; `payment_mandate.md` → constraints; mandate schemas | Closed Checkout Mandate binds to the merchant-signed Checkout JWT via `checkout_hash`. Payment Mandate binds to that Checkout and carries payee, amount, payment instrument, execution-date and reference constraints. Normative verification requires relevant hashes/constraints to match. | No protocol-level material gap identified in v0.2 normative binding. Implementation conformance issues are tracked separately. |
| 3. Issuer ↔ Verifier Separation | **COVERED** | `agent_authorization.md` → User Credential, Trusted Agent Provider, Action Authorization; `specification.md` → Verification | User / Trusted Surface / Agent Provider authorization is verified by Merchant, Credential Provider, Network and MPP roles. The Verifier evaluates signed Mandate integrity/constraints without reconstructing the user's private reasoning. | No material gap identified for role separation within AP2's trust models. |
| 4. Replay / Use Semantics | **PARTIAL** | `agent_authorization.md` → Action Authorization; `specification.md` → Autonomous mode; `payment_mandate.md` → Agent Recurrence, Budget | AP2 defines expiry, transaction/key binding, signed receipts, recurrence, max occurrences, budget accumulation and prior-presentation tracking. It also tells Shopping Agents not to present another open Mandate after a successful use. However the v0.2 verifier rules do not define one universal mandatory atomic consume of every accepted closed Mandate. | **Yes.** A generic single-use/consume-once claim would require persistent verifier-side state/consumption semantics, which is material under the frozen rubric. |
| 5. Multi-surface Enforcement | **COVERED** | `specification.md` → Merchant; Credential Provider and Network; Merchant Payment Processor; `payment_mandate.md` → Reference | AP2 has multiple consequential verification surfaces: Merchant gates Checkout; Credential Provider/Network gate payment credential release; MPP gates payment processing. Checkout and Payment authority are linked through Checkout hashes/reference semantics. Failures are required to reject/return error receipts. | No material gap identified for AP2's modeled commerce/payment surfaces. |
| 6. Post-flight Conformance | **PARTIAL** | `specification.md` → Dispute Evidence, Verification: Dispute; receipt schemas | AP2 has signed Checkout/Payment Receipts bound by hash to closed Mandates. Receipt schemas represent final Checkout/Payment state; successful Payment Receipts carry PSP/network confirmation IDs and successful Checkout Receipts carry an order ID. Dispute verification proves mandate/receipt integrity and what parties saw. The normative dispute rules do not require an independent verification that payment-rail confirmation IDs themselves correspond to an externally observed settlement/finality event. | **Yes.** Strong execution-conformance would require an independently verifiable post-flight fact or verification relation beyond mere signed receipt fields. |

## 3. Detailed axis notes

### Axis 1 — Authority Object: COVERED

AP2 states that Mandates are its core means of authorizing agents.

The Agent Authorization model makes the role explicit:

- Mandate Delegation: a user authorizes an Agent;
- Action Authorization: a Verifier challenges the Agent for proof that it is authorized;
- the Agent presents a Mandate;
- the Verifier checks integrity and whether Mandate Content permits the requested action;
- acceptance/rejection produces a signed Mandate Receipt.

Closed Mandates are described as bound to a particular transaction with a Verifier.

Pass A conclusion:

The core idea “signed/verifiable object that authorizes a constrained consequential action” is not novel to PayGod relative to AP2 v0.2.

### Axis 2 — Binding: COVERED

Normative AP2 binding is substantial.

Checkout:

- Merchant provides a merchant-signed Checkout JWT;
- the Checkout Mandate contains `checkout_hash`;
- Merchant MUST verify the hash of the Checkout JWT sent for approval matches the Mandate.

Payment:

- Payment Mandate `transaction_id` identifies the Checkout by hash;
- Payment constraints include payee, payment instrument, PISP, amount range, budget, reference and execution date;
- Payment Reference can bind to an associated Open Checkout Mandate/delegate chain.

This is semantic binding rather than PayGod's exact-byte Transition Envelope profile. The frozen rubric explicitly permits structured semantic binding.

Pass A conclusion:

AP2 covers the binding function in its own payment/commerce domain.

Known SDK/sample deviations do not downgrade the normative-protocol score. They are issue hypotheses/implementation-conformance findings.

### Axis 3 — Issuer ↔ Verifier Separation: COVERED

AP2 supports multiple trust paths, including User Credential and Trusted Agent Provider models.

The authorization source and the consequential verifier are separable:

- user/trusted surface/agent provider establishes authority;
- Merchant verifies Checkout authority;
- Credential Provider/Network verifies Payment authority before credential release;
- MPP verifies the Payment Credential before processing.

The Verifier checks cryptographic authority and constraints; it does not need the User's private reasoning process.

Pass A conclusion:

This overlaps strongly with the PayGod “issuer separate from enforcer” hypothesis.

Important limitation:

AP2's authority source is user/agent authorization for commerce/payment. This score does not say AP2 performs PayGod evidence ingestion or deterministic evidence-derived policy decisions.

### Axis 4 — Replay / Use Semantics: PARTIAL

AP2 has meaningful use semantics:

- open mandates can carry expiry;
- closed Mandates use key/transaction binding;
- successful Mandate Receipts reduce the scope of the open Mandate;
- standard autonomous flows prohibit a Shopping Agent from presenting another open Payment/Checkout Mandate after successful authorization;
- recurrence explicitly supports controlled reuse;
- recurrence evaluation requires tracking previous presentations;
- budget evaluation requires accumulated previous spend and updating the accumulated amount after approval.

But the generic v0.2 verification rules reviewed in Pass A do not establish a universal verifier-side atomic consume for each accepted closed Payment Mandate.

This matters because PayGod Warrant v0 currently makes nonce consumption and S0 state a first-class authority invariant.

Pass A conclusion:

AP2 substantially overlaps with replay/use semantics, but does not receive `COVERED` under the frozen minimum because a generic single-use acceptance cannot be derived from a mandatory consume-once rule across the relevant verifier path.

### Axis 5 — Multi-surface Enforcement: COVERED

AP2 is not a single-verifier system.

Normative surfaces include:

1. Merchant → Checkout Mandate verification before completing Checkout.
2. Credential Provider / Network → Payment Mandate verification before returning payment credentials.
3. Merchant Payment Processor → Payment Credential scope verification before payment processing.

The Payment Mandate is tied to the Checkout through the Checkout JWT hash/reference structure.

Therefore AP2 already demonstrates an authority model spanning multiple consequential roles and surfaces.

Pass A conclusion:

The mere existence of E1/E2-like multi-point enforcement is not, by itself, sufficient originality for PayGod.

The ACP split-channel problem remains structurally different, but AP2 shows that multiple enforcement roles bound by authorization objects are already prior art.

### Axis 6 — Post-flight Conformance: PARTIAL

AP2 provides stronger post-action evidence than a simple authorization-only protocol:

- Verifiers MUST return signed Mandate Receipts after acceptance/rejection;
- Checkout Receipt references the closed Checkout Mandate hash;
- Payment Receipt references the closed Payment Mandate hash;
- successful Checkout Receipt includes `order_id`;
- successful Payment Receipt includes `payment_id`, `psp_confirmation_id`, and `network_confirmation_id`;
- dispute verification re-verifies Mandates and checks Receipt references.

The AP2 specification says that after those checks the Mandate information can be used as evidence of what the user and roles saw.

However, the reviewed normative dispute rules do not require the dispute verifier to independently validate that the PSP/network confirmation IDs correspond to a genuine external payment-rail event, settlement, or finality.

Pass A conclusion:

AP2 has signed, mandate-bound post-flight evidence, so `NOT COVERED` would be incorrect.

But Pass A does not find enough normative text to claim full independent execution conformance, so the score is `PARTIAL`.

## 4. Axis 7 — Bottleneck / Value Owner

Pass A score:

**UNKNOWN**

Specification analysis can identify protocol roles, but it does not establish who will pay an independent supplier for any remaining replay/conformance gap.

```text
pain_owner: UNKNOWN
failure_or_compliance_cost: UNKNOWN
current_workaround: AP2 Mandates/Receipts + participant-local state; exact production practices unknown
control_point_owner: Merchant / Credential Provider / Network / MPP depending on surface
internal_buildability: plausibly high for participant-local controls, but not behaviorally validated
external_supplier_acceptability: UNKNOWN
likely_buyer: UNKNOWN
observed_budget_or_resource_commitment: NONE OBSERVED IN THIS PASS
```

Commercial interpretation:

A technical remaining gap cannot be converted into a PayGod product claim from the specification alone.

## 5. Pass A derived result

```text
technical_coverage_vector:
  [COVERED, COVERED, COVERED, PARTIAL, COVERED, PARTIAL]

covered_count:
  4

warrant_originality_status:
  WATCH

mapping_status:
  PARTIAL

enforceability_status:
  ENFORCEABLE

commercial_status:
  UNKNOWN
```

These are **Pass A results**, not the reconciled final Collision Test.

## 6. Kill Rule calculation — Pass A only

Four of the six technical axes are `COVERED`.

The two non-covered axes are:

- Axis 4 Replay / Use Semantics → `PARTIAL`, material;
- Axis 6 Post-flight Conformance → `PARTIAL`, material.

Under the frozen Kill Rule, four covered axes alone are insufficient to kill the Warrant hypothesis when the remaining gaps are material.

Therefore Pass A yields:

`WARRANT_ORIGINALITY = WATCH`

not `REJECT`.

Important interpretation:

This does **not** mean the Warrant primitive is broadly original.

Pass A already finds that AP2 substantially covers:

- authority object;
- action binding;
- issuer/verifier separation;
- multi-surface enforcement.

The surviving hypothesis has narrowed sharply toward:

- explicit consume/replay state; and
- independently grounded post-flight conformance.

## 7. Adapter/core check

No AP2 adapter has been built.

A future clean mapping would be permitted to:

- parse Mandates/Receipts;
- preserve exact AP2 artifacts;
- compute references/digests;
- project AP2 identities/actions to PayGod transition fields.

A future adapter must **not** be credited with AP2 coverage if it has to invent:

- consume-once semantics absent from AP2;
- independent rail confirmation;
- a new cross-surface authority relation;
- a new authority decision.

If such behavior is necessary, mapping status remains `PARTIAL` or becomes `OVERFIT`.

## 8. Primary-source versus issue separation

The following provisional findings come from primary sources and are sufficient for the Pass A scores:

- AP2 defines signed/verifiable Mandates used for Action Authorization.
- AP2 normatively binds Checkout and Payment authority.
- AP2 separates authorization source and verifier roles.
- AP2 defines recurrence/budget/history semantics but Pass A does not find a universal mandatory closed-Mandate consume rule.
- AP2 has Merchant, Credential Provider/Network and MPP enforcement surfaces.
- AP2 defines signed, Mandate-bound Checkout and Payment Receipts and dispute verification, but Pass A does not find a normative independent payment-rail-finality verification requirement.

Repository issues are used only to formulate tests against these interpretations.

## 9. What Pass B must attack

Pass B should try specifically to overturn the two pivotal Pass A scores:

1. **Axis 4:** find normative AP2 text that makes every relevant accepted closed Mandate unambiguously single-use/consumed, or prove that the frozen rubric does not require that property for AP2's intended semantics.
2. **Axis 6:** find normative AP2 text that makes a signed Receipt independently sufficient to prove the actual executed payment/checkout outcome rather than merely a verifier-signed final-state claim.

If Pass B upgrades both Axes 4 and 6 to `COVERED`, the frozen Kill Rule would be strongly implicated.

If Pass B confirms either material gap, Warrant originality remains `WATCH`, while the actual surviving PayGod value still requires separate commercial evidence.

## 10. No final product conclusion

Pass A does not establish:

- PayGod originality;
- AP2 deficiency;
- PayGod market demand;
- AP2 portability;
- external enforcer acceptance;
- independent commercial value of evidence/conformance.

Those remain separate questions.

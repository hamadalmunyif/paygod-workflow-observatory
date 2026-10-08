# Continuity Independent Review Handoff v0

Status: **READY FOR EXTERNAL HUMAN REVIEW**

Purpose: give a reviewer the smallest neutral package needed to try to break the current decision-to-Warrant continuity boundary without exposing prior conclusions. This revision re-freezes the target after the trust-boundary clarification and regression test added following the self-trusting falsifier review.

## Frozen review target

Repository:

`hamadalmunyif/paygod-workflow-observatory`

Review commit:

`2d1a8fc4c2b7ecb45ebd365ca41739de0455cb3f`

This commit is the re-frozen post-falsifier main review target and completed all three main-branch workflows successfully:

- `ci`
- `shadow-contract`
- `authority-release-contract`

Do not review a later commit unless the handoff is explicitly re-frozen again.

## Reviewer question

> Try to issue a valid Warrant for a state / Release Candidate that was not the exact state evaluated by the authenticated PayGod decision.

The reviewer is free to use any mutation, cross-run substitution, stale artifact, alternate ordering, replay, or internally coherent A/B construction that remains inside the current T0 boundary.

The review scope is explicitly **Threat Model T0**, including **T0-I**: the Warrant issuer process and active issuer signing key are assumed uncompromised. An attack that starts by possessing or compromising the issuer signing key/process is outside this review scope unless it demonstrates a stronger in-scope consequence than the documented T0-I limitation.

## Read first

Only these files are required initially:

- `docs/CONTINUITY_OF_IDENTITY_V0.md`
- `docs/THREAT_MODEL_T0.md`
- `test/identity-continuity-v0.test.mjs`
- `src/controlled-decision-admission-v0.mjs`
- `scripts/issue-controlled-warrant-v0.mjs`
- `src/warrant-v0.mjs`
- `src/controlled-release-candidate-v0.mjs`

Do not start from prior vulnerability reports, prior reviewer conclusions, or Pass A/AP2 conclusions.

## Access, confidentiality, and minimal execution

Repository access:

- repository visibility may change; use only the exact frozen review commit above;
- findings, reproductions, screenshots, and repository contents should remain confidential until the repository owner explicitly agrees otherwise.

Environment:

- use **Node.js 22** for the review environment.

Start with one command:

```bash
npm test
```

The reviewer may then add local adversarial tests or scripts as needed. Those local changes do not need to be proposed upstream unless they expose a finding worth preserving.

## Trust-boundary rule for falsifiers

A falsifier must preserve the frozen trust configuration.

The following does **not** establish a T0 bypass by itself:

1. generate a new attacker-controlled Warrant issuer key;
2. sign a Warrant with that key; and
3. construct a fresh local verifier trust set that trusts the same attacker key.

That demonstrates signature self-consistency under an attacker-selected trust root, not acceptance by the frozen T0 enforcement trust root.

Likewise, directly importing the low-level `issueControlledWarrantV0` helper and supplying caller-authored `paygodVerification` metadata is not the canonical issuer process. The canonical controlled issuer entrypoint is `scripts/issue-controlled-warrant-v0.mjs`, which first runs the pinned PayGod standalone verifier with the external decision trust store and requires issuer authenticity before loading the verification result.

A material finding exists if the reviewer can make the **canonical issuer path**, using the frozen issuer/trust configuration and without compromising T0-I, issue an accepted Warrant for an unauthenticated or differently evaluated candidate.

If the reviewer can reach the low-level helper through a signer/API actually exposed to adversarial client C while still using the active trusted issuer key, that is separately material because it would move the helper into the declared T0 attack surface.

## Success / failure criterion

A material failure exists if the reviewer can produce a path in which:

1. the current exact object / Release Candidate is not the one authenticated decision evaluation covered; and
2. the issuer path still produces a Warrant accepted under the current verification/enforcement assumptions.

A result is not a material continuity failure merely because:

- Warrant v0 lacks direct portable Decision Receipt commitment; that limitation is already declared;
- T0-I assumes the Warrant issuer process and signing key are uncompromised;
- an attack requires capabilities explicitly outside T0;
- the attacker replaces the frozen trusted-issuer set with its own key.

If either declared limitation itself enables a stronger in-scope attack than documented, record that separately.

## Requested output

Return only:

```text
reviewer_class:
review_commit:

tests_run:
- ...

finding:
PASS | FAIL | INCONCLUSIVE

reproduction:
- exact command / script / fixture
- expected result
- observed result

affected_boundary:
...

materiality:
...

notes:
...
```

Do not provide a product recommendation, AP2 opinion, or market assessment.

## Independence declaration

The review counts as external independent validation only if the reviewer is a human outside the PayGod build/research loop with relevant security, protocol, smart-contract, authorization, or systems expertise.

If the reviewer used substantial help from PayGod participants or an AI system, record that fact and classify the review accordingly rather than calling it independent external validation.

## Deadline

Review clock started: **2026-10-08**

Decision date: **2026-10-15**

If no qualified external human review is obtained by the decision date, record:

`NOT_OBTAINED_BY_DEADLINE`

and continue to the already-frozen AP2 Collision Pass B with the missing independent review preserved as an explicit limitation.

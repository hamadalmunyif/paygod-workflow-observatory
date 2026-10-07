# Authority Preflight — Attack Catalogue v0

Status: **FROZEN BEFORE HARNESS IMPLEMENTATION**

Purpose: define the attacks that must be attempted against the first controlled two-party authority harness.

This catalogue is derived from `THREAT_MODEL_T0.md` and must be treated as a falsification plan, not a demo checklist.

## 1. Result vocabulary

Each attack must end in one of:

- `REJECTED_AS_EXPECTED`
- `BYPASS_OBSERVED`
- `NOT_TESTABLE_UNDER_T0`
- `HARNESS_DEFECT`

A harness defect must not be reclassified as a successful security result.

## 2. Gate Zero — alternate authority path

### A0 — execute without PayGod path

Attempt to create the same consequential transition without invoking the PayGod-enforcing path.

Examples:

- direct ACP SDK call;
- direct ACP CLI call;
- direct RPC call;
- alternate application route;
- alternate signer/wallet route.

Expected result: `REJECTED_AS_EXPECTED`.

If the same transition succeeds, stop. The tested architecture is **Advisor / Evidence Authority**, not conditional release authority.

### A1 — unrestricted signing path

Attempt to obtain a usable signature through any signing interface exposed to the Agent that does not validate the warrant.

Expected result: `REJECTED_AS_EXPECTED`.

### A2 — alternate signer or account

Attempt to substitute another signer/account capable of producing the same protected transition.

Expected result: either explicitly outside T0 and documented, or `REJECTED_AS_EXPECTED` if inside T0.

No silent omission is allowed.

## 3. Warrant validity attacks

### A3 — no warrant

Present the exact intended transition without a warrant.

Expected: reject.

### A4 — invalid signature

Modify the warrant body after signing or present an invalid signature.

Expected: reject.

### A5 — untrusted issuer

Present a mathematically valid warrant signed by a key not in the trusted issuer set.

Expected: reject.

### A6 — expired warrant

Present after `expires_at`.

Expected: reject.

### A7 — not-yet-valid warrant

Present before `not_before`.

Expected: reject.

## 4. Binding attacks

### A8 — request A / transaction B

Use a warrant whose transition commitment was created for request/action A while submitting different transaction bytes B.

Expected: E1 rejects.

### A9 — transaction A / payload B

Use correct transaction bytes but modify the requirement payload after warrant issuance.

Expected: E2 rejects.

### A10 — payload A / transaction B

Use correct payload bytes but modify target, calldata, chain, or native value.

Expected: E1 rejects.

### A11 — wrong enforcement domain

Present a valid warrant from a different enforcement domain.

Expected: reject.

### A12 — stale transition envelope

Use a warrant bound to an earlier transition envelope after any committed field has changed.

Expected: reject.

## 5. Replay attacks

### A13 — replay consumed warrant

Use the same valid warrant and nonce after one successful consumption.

Expected: reject.

### A14 — concurrent double use

Race two uses of the same nonce.

Expected: at most one succeeds.

### A15 — nonce-store restart

Restart the enforcement component and replay a previously consumed warrant.

Expected: reject if persistence is part of T0.

If persistence is not part of T0, the limitation must be explicit and the claim narrowed.

### A16 — nonce-store rollback/reset

Attempt any Agent-accessible reset or rollback path defined inside T0.

Expected: reject or make replay impossible.

If the Agent can reset consumed-nonce state, classify `BYPASS_OBSERVED`.

## 6. Surface-isolation attacks

### A17 — bypass E1 only

Attempt to reach the on-chain transaction surface while avoiding the transaction validator.

Expected: reject.

### A18 — bypass E2 only

Attempt to deliver/accept a requirement payload while avoiding the provider-side payload validator.

Expected: reject.

### A19 — valid E1, invalid E2

Allow transaction surface but deliberately fail payload binding.

Expected: overall transition must not be classified as authorized/conformant.

### A20 — valid E2, invalid E1

Allow payload surface but deliberately fail transaction binding.

Expected: overall transition must not be classified as authorized/conformant.

## 7. Configuration attacks

### A21 — replace enforcement component

Attempt any Agent-permitted mechanism for disabling, replacing, or reconfiguring E1/E2.

Expected: reject.

### A22 — modify trusted issuer set

Attempt any Agent-permitted modification to trusted issuer keys.

Expected: reject.

### A23 — modify frozen transition artifact

Change the stored transition envelope after its commitment was signed.

Expected: digest mismatch / reject.

## 8. Authenticity boundary attacks

### A24 — producer self-asserts trusted status

Inject producer-written labels such as `trusted`, `verified`, `authorized`, or equivalent into request/payload artifacts.

Expected: these labels must not upgrade verifier-derived authority.

### A25 — compromised trusted issuer simulation

This is not a normal bypass test. If the trusted issuer private key itself is assumed compromised, T0 treats the issuer epoch as totally compromised.

Expected: `NOT_TESTABLE_UNDER_T0` as a security guarantee; document as trust-root failure, not as a passed test.

## 9. ACP split-channel specific attacks

### A26 — correct createJob, wrong requirement message

Create the exact approved on-chain job action but post a different requirement payload.

Expected: E2 rejects / provider does not treat the transition as authorized.

### A27 — correct requirement message, wrong createJob

Present the approved payload but use different EVM createJob bytes.

Expected: E1 rejects.

### A28 — job correlation substitution

Attempt to attach an approved payload to a different job id / chain context than the one observed for the protected transition.

Expected: reject or classify as non-conformant.

## 10. Issuance-path attacks

These attacks were added before harness implementation after freezing the issuer/enforcer separation.

### A29 — mint without canonical ALLOW

Attempt to obtain a Warrant v0 without an eligible canonical PayGod ALLOW decision.

Expected: reject.

### A30 — denied decision override

Use a canonical denied/non-releasable decision and request warrant issuance.

Expected: reject.

### A31 — request substitution at issuance

Use a canonical ALLOW for request A but present a Transition Envelope bound to request B.

Expected: reject.

### A32 — transition substitution at issuance

Use a valid ALLOW decision, then alter any committed transition surface before issuance.

Expected: reject unless the canonical decision path is rerun and authorizes the new exact transition under the frozen issuance profile.

### A33 — wrong-domain issuance

Request a warrant for an enforcement domain outside the configured harness domain.

Expected: reject.

### A34 — issuer as arbitrary signing oracle

Attempt to get the issuer to sign caller-chosen bytes or a caller-chosen transition commitment without satisfying the canonical issuance preconditions.

Expected: reject.

Any successful A29-A34 result is an authority bypass even if E1/E2 correctly verify signatures.

## 11. Pass condition

The catalogue passes only if:

1. all attacks declared testable under T0 have a recorded outcome;
2. no `BYPASS_OBSERVED` exists;
3. any `NOT_TESTABLE_UNDER_T0` item narrows the final claim;
4. the tests were frozen before the harness implementation that they evaluate;
5. E1 and E2 are both covered.

Passing this catalogue supports only the bounded T0 claim defined in `THREAT_MODEL_T0.md`.

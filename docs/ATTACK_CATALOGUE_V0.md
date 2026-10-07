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

### A35 — duplicate nonce issuance

Attempt to obtain two returned warrants under the same `issuer_key_id + nonce`.

Expected: S0 registration permits at most one issued warrant identity.

### A36 — execution-account substitution

Use a valid warrant/envelope but attempt the protected transaction from an execution account different from the one committed in the envelope.

Expected: E1 rejects; if an in-scope alternate account can produce the same protected business consequence outside E1, Gate Zero fails.

### A37 — payload-recipient substitution

Use the exact authorized payload bytes but attempt release/acceptance by a provider identity different from `payload.recipient`.

Expected: E2/P rejects or the result is nonconformant.

### A38 — signed but unregistered warrant

Present a correctly signed Warrant that has no matching S0 `ISSUED` registration.

Expected: reject.

### A39 — S0 warrant-body mismatch

Present a correctly signed Warrant whose body digest differs from the digest registered under the same issuer/nonce.

Expected: reject.

### A40 — E1 before payload stage

Attempt transaction reservation while S0 is still `ISSUED`.

Expected: reject.

### A41 — payload release before matching transaction evidence

Attempt payload release before `TX_EXECUTED`.

Expected: reject.

## 11. Decision-authenticity bridge attacks

These attacks are frozen before Warrant issuance implementation.

### A44 — unsigned PayGod decision receipt

Present a bundle with valid internal integrity but no `receipt.sig.json`.

Expected: D→I admission rejects.

### A45 — untrusted decision signer

Present a mathematically valid receipt signature from a key absent from the externally configured D trust store.

Expected: reject.

### A46 — receipt mutated after D signature

Change `receipt.json` after signing.

Expected: issuer-authentication fails and D→I admission rejects.

### A47 — candidate / receipt input mismatch

Present an authenticated PayGod receipt whose canonical input hash does not match the exact Release Candidate being proposed for issuance.

Expected: reject.

### A48 — authenticated decision from wrong pack contract

Present an authenticated receipt whose pack name, version, digest, verdict, or rule differs from the frozen controlled-release profile.

Expected: reject.

### A49 — client trust-store substitution

Attempt any T0 path by which C replaces or extends the D public-key trust configuration used for D→I admission.

Expected: reject. If C can install its own trusted D key, record `BYPASS_OBSERVED`.

### A50 — D signing oracle bypass

Attempt to invoke the D receipt-signing capability on a caller-supplied arbitrary receipt without traversing the protected canonical-decision path.

Expected: reject or be unreachable under the frozen boundary. If accessible to C, the D→I trust bridge fails.

## 12. Local EVM rail attacks

These attacks are frozen before Slice 2 implementation.

### A51 — privileged RPC through R-client

Attempt Anvil/dev-node administrative methods through the client-facing RPC proxy, including `anvil_*`, `evm_*`, `personal_*`, and signing/unlocked-account methods.

Expected: proxy rejects locally and does not forward.

If any privileged method reaches R-admin through R-client, classify `HARNESS_DEFECT` or `BYPASS_OBSERVED` according to consequence.

### A52 — direct R-admin reachability

From adversarial client C, attempt direct network connection to the raw Anvil/admin RPC endpoint.

Expected: unreachable under the frozen network boundary.

If C can reach R-admin, the T0 rail boundary fails before any E1 authority claim is considered.

### A53 — protected account through node-managed signing

Attempt `eth_sendTransaction`, `eth_sign`, `eth_signTransaction`, or equivalent node-managed signing for the protected execution account.

Expected: rejected/not exposed.

A successful protected-account signature or transaction through node-managed signing is `BYPASS_OBSERVED`.

### A54 — alternate account produces protected contract consequence

Using an independently controlled alternate account, attempt to invoke the surrogate contract so that it records the protected transition as if it came from `protected_execution_account`.

Expected: contract rejects or resulting state is observably a different transition.

If the protected client identity/state can be produced without E1, Gate Zero fails.

## 13. Pass condition

The catalogue passes only if:

1. all attacks declared testable under T0 have a recorded outcome;
2. no `BYPASS_OBSERVED` exists;
3. any `NOT_TESTABLE_UNDER_T0` item narrows the final claim;
4. the tests were frozen before the harness implementation that they evaluate;
5. E1 and E2 are both covered.

Passing this catalogue supports only the bounded T0 claim defined in `THREAT_MODEL_T0.md`.

Decision-authenticity attacks A44-A50 must pass before any local Warrant issuance witness may be promoted beyond design-only status.

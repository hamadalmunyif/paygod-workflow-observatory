# Live ACP -> PayGod Witness 001 Result

Run: `37472284802`  
Date: 2026-10-06  
ACP CLI pin: `9d2be827cc19e4ea2cecfff3896398607537ea3e`  
PayGod kernel pin: `23ea2cca74ef8b698718c6d0c8dbda447f13bb37`

## What succeeded

The live GitHub Actions run completed all of these steps successfully before the PayGod admission failure:

- human Virtuals authentication;
- signerless `AgentApi.browse()` marketplace read;
- `GET /agents/search`;
- 10 live browse results captured;
- Observation Pack generated;
- exact offering `getCongressTrades` observed;
- descriptor selection succeeded;
- internal request state correctly became `WITHHELD_NO_PAYLOAD`;
- PayGod repository-boundary check passed;
- pinned PayGod tests passed;
- canonical PayGod CLI published.

No Agent creation, signer configuration, ACP Job creation, funding, resource invocation, or transaction execution occurred.

## Failure observed

The first shadow envelope embedded the full normalized ACP descriptor. The live descriptor contained at least one floating-point number. The pinned PayGod canonicalizer rejected the input before policy execution:

```text
ERR[CANONICAL_INPUT_REJECTED]:
Floating-point and exponent numbers are not allowed by paygod-c14n-v1.
```

Classification:

```text
external evidence admission mismatch
NOT a proven kernel defect
```

The kernel failed closed exactly at its documented canonicalization boundary.

## Corrective action

Do not change PayGod canonicalization merely to fit ACP.

Instead:

- preserve the full external descriptor in the Observation Pack;
- bind the descriptor and requirements schema by canonical SHA-256 in the observatory;
- pass only a PayGod-safe shadow admission envelope into the kernel;
- keep raw descriptor/request payload outside the canonical PayGod input;
- keep ACP execution authority false.

This preserves the existing PayGod stop-build boundary and makes the evidence-admission step explicit.

## Non-claims

This witness does not prove:

- ACP provider truth;
- source authenticity;
- trusted time;
- request semantic correctness;
- live ACP job execution;
- economic value;
- PayGod authority over ACP.

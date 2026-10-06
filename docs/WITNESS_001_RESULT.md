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


## Closure run

Corrected live run: `37474713196`  
Result: **PASS — SHADOW OBSERVATION CLOSED**

The corrected run completed the full chain:

- authenticated signerless ACP browse;
- 10 live ACP search results;
- Observation Pack creation;
- exact `getCongressTrades` descriptor observed;
- request status `WITHHELD_NO_PAYLOAD`;
- PayGod canonical input accepted;
- PayGod verdict `flag`;
- PayGod rule `payload-missing`;
- Receipt, Manifest, Ledger, Plan, and Findings emitted;
- private short-lived witness artifact uploaded.

Bindings from the closure run:

- raw observation SHA-256: `f7d0fe668caebb5a5a4b5fac7a0ed7a5a390fb1c84c516daa3524587c9f21ee7`
- normalized observation SHA-256: `93ced4ffb2cc9d37f02fb4791fa37c3e57aa4d9ac4a63e1a02d8434d9e4dc284`
- selected descriptor SHA-256: `75c468559f5ce0ed172493ecf641c6129519db57fd86e20a94653cab2762cc2c`
- observed requirements SHA-256: `8aff642e60abfb9295fa9d2f2aa9875d2c7ab3cfe33e9ae561a07f09886aaf67`
- PayGod input canonical hash: `8c1645894194b7886a211b903f43b2db85a50cb739de11e1d8f657099568e982`
- PayGod bundle digest: `3f7cd448fd7ebe82f6f6d77aafa312b02b3a576bacdc6a5f5c2ae4c9a805448c`

The live observed request contract for `getCongressTrades` permits an optional `ticker` string and an optional numeric `limit` with maximum `1000`; empty parameters are also described as valid for the latest unfiltered tape.

Witness 001 therefore establishes that a real ACP capability descriptor can be observed, evidence-bound, admitted into the existing PayGod boundary, and converted into canonical PayGod artifacts without changing the kernel and without creating an ACP Job.

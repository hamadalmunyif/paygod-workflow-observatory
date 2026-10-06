# ACP -> PayGod Request Shadow Witness 002

Status: **READY — NO ACP EXECUTION AUTHORITY**

Source live witness: `37474713196`  
Observed offering: `getCongressTrades`

## Frozen request candidate

```json
{"limit":5}
```

This request is chosen directly from the live observed requirement schema:

- request object is optional-input object;
- `limit` type: number;
- observed default: 100;
- observed maximum: 1000;
- optional `ticker`: string.

The candidate omits `ticker`, matching the live description that an omitted ticker returns unfiltered congressional trades.

## Test purpose

Witness 002 does **not** create an ACP Job. It reuses the immutable Observation Pack from Witness 001 and asks only:

> Can an exact request candidate be locally validated against the observed ACP request contract, digest-bound, and admitted by the existing PayGod kernel in shadow mode?

Expected chain:

```text
Witness 001 Observation Pack
        ->
{"limit":5}
        ->
local schema validation
        ->
request payload canonical digest
        ->
PayGod-safe admission envelope
        ->
PayGod shadow allow
        ->
Receipt / Manifest / Ledger
```

`allow` means **shadow admission only**. It is not authorization to call ACP, create a Job, fund, sign, purchase, or execute.

## Explicit non-claims

A local schema-valid request does not prove:

- ACP will accept the request at runtime;
- the provider will execute it;
- the deliverable will be correct;
- provider data is truthful;
- payment or economic exposure is authorized;
- PayGod has ACP execution authority.

The next boundary after this witness would be a separately approved live ACP Job transition.

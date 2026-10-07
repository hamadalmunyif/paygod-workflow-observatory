# Controlled Harness T0 Closure v0

Status: **CLOSED LOCAL REFERENCE-HARNESS WITNESS**

Date: 2026-10-07

This document records the first completed local two-surface controlled-conditional-release witness. It is a result record, not a broader product or originality claim.

## 1. Frozen source

Main commit:

`83fcfd5f11655f3f43613d686145e1229a97492c`

Pinned canonical PayGod kernel:

`hamadalmunyif/paygod-kernel-mvp@23ea2cca74ef8b698718c6d0c8dbda447f13bb37`

Enforcement domain:

`controlled-harness/t0-v0`

Local EVM chain:

`31337`

## 2. Successful main-push runs

All three required workflows succeeded on the same main commit.

- `ci` — run `37638214849`
- `shadow-contract` — run `37638215013`
- `authority-release-contract` — run `37638214816`

Authority-harness unit/integration test result on the main run:

- tests: 98
- pass: 98
- fail: 0
- skipped: 0

## 3. Evidence artifact

GitHub Actions artifact:

- artifact id: `11490687786`
- name: `authority-release-contract-37638214816`
- GitHub artifact digest:
  `sha256:39b8ba7d231f012642434ace77358974d049f600f08a363093b817b60006ea14`

The final post-flight Evidence Bundle manifest contains 24 committed files.

Secondary post-run artifact inspection outside the workflow assertions recomputed every manifest file SHA-256 and byte count with zero mismatches.

No private-key / PEM / keystore artifact was present in the downloaded evidence archive.

## 4. Closed causal chain

The runtime-observed local chain is:

```text
Observation / Evidence
        ↓
Exact Request Identity
        ↓
Real Transition Envelope
        ↓
Canonical PayGod ALLOW
        ↓
Authenticated PayGod receipt
        ↓
Verifier-derived D → I trust
        ↓
Signed Warrant v0
        ↓
S0: ISSUED
        ↓
E2 exact payload staging
        ↓
S0: PAYLOAD_STAGED
        ↓
E1 exact transaction reservation
        ↓
S0: TX_RESERVED
        ↓
Protected-key internal signing
        ↓
Real local EVM transaction
        ↓
S0: TX_EXECUTED
        ↓
E2 exact staged-payload release
        ↓
Controlled provider runtime observation
        ↓
S0: PAYLOAD_RELEASED
        ↓
Separate-process verifier V
        ↓
S0: CONFORMANT
```

## 5. Final S0 event evidence

The downloaded SQLite authority-state store contains one successful monotonic event sequence:

```text
I  : ∅                -> ISSUED
E2 : ISSUED           -> PAYLOAD_STAGED
E1 : PAYLOAD_STAGED   -> TX_RESERVED
E1 : TX_RESERVED      -> TX_EXECUTED
E2 : TX_EXECUTED      -> PAYLOAD_RELEASED
V  : PAYLOAD_RELEASED -> CONFORMANT
```

Every recorded event has result `SUCCESS`.

Final durable S0 state:

`CONFORMANT`

## 6. Gate Zero result

The official main-push Gate Zero result is:

`NO_BYPASS_OBSERVED_UNDER_T0_E1_PRE_PROVIDER`

Witness status:

`MAIN_PUSH_WITNESS`

Frozen attempt totals:

- declared: 13
- rejected as expected: 13
- bypass observed: 0
- harness defect: 0
- not testable under T0: 0

The result supports only:

> No bypass was observed under Threat Model T0 across the declared E1 transaction enforcement surface of the controlled local harness.

It is not a universal non-bypassability claim.

## 7. Two-surface post-flight result

Independent-process verifier V completed 23 positive checks on the main-push run and emitted:

`AUTHORIZED_CONFORMANT`

Final verifier result:

- S0 state: `CONFORMANT`
- conformant state written: `true`
- transition commitment:
  `3761804134b81ae7d4fc030ebb7c18504ec527cc3a7234f532c2cd0b8fd58f0d`
- local transaction hash:
  `0xcc5dcd073046cb809f7ebe9dba5d137537a276230476dd5ed980bb2dd928f0d3`
- derived job id: `1`
- payload SHA-256:
  `0df3c0d7f838b7f0102e1ca746a1bfaed19521943a9d5b9fa3cd1032711b39c2`
- provider identity:
  `0x3333333333333333333333333333333333333333`
- post-flight bundle manifest SHA-256:
  `77a69cc48065ab4d342b47bd876b2b53d068c71e9160b046515032b766bd5a0d`

The exact payload bytes were byte-identical across:

- frozen request payload;
- E2 staged payload;
- E2 released payload;
- provider-received payload.

## 8. Maximum supported claim

The maximum supported claim for this witness is:

> Controlled conditional release was runtime-observed under Threat Model T0 across the declared E1 transaction and E2 payload/provider enforcement surfaces of the closed local harness.

Equivalent negative form:

> No bypass was observed under Threat Model T0 across the declared E1 and E2 enforcement surfaces of the closed local harness.

## 9. Explicit limitations

This witness does **not** establish:

- universal non-bypassability;
- independent production enforcement;
- external-provider acceptance;
- ACP / Quiver authority;
- public-chain authority;
- Warrant originality;
- trusted external time;
- canonical PayGod decision replay;
- gas / fee / nonce economic authority;
- T1 host/root/rollback resistance;
- HSM/MPC/smart-account key isolation;
- commercial demand or willingness to pay.

The protected key, E1, E2, S0 and provider remain inside one controlled reference-harness administrative environment even though V is a separate process and the adversarial client is isolated under T0.

## 10. Epistemic classification

### Proven / runtime-observed inside the closed harness

- exact evidence/request binding;
- authenticated canonical PayGod ALLOW;
- authenticated Decision → Warrant issuance;
- durable Warrant registration;
- exact E2 payload staging;
- exact E1 transaction binding and single reservation;
- protected-key local EVM execution;
- official bounded E1 Gate Zero witness under T0;
- exact post-execution E2 payload release;
- controlled provider runtime observation;
- separate-process post-flight verification;
- monotonic S0 closure at `CONFORMANT`.

### Still hypotheses

- external enforcer acceptance;
- authority portability across independent enforcers;
- Warrant originality relative to AP2 and other prior art;
- economic value of remaining evidence/conformance gaps;
- production-grade key/state independence.

## 11. Stop boundary

This witness closes the currently authorized local engineering sprint.

Until AP2 Collision Pass B is completed under the frozen review protocol:

- do not open T1;
- do not build an AP2 adapter;
- do not build an x402 adapter;
- do not add product/dashboard scope;
- do not move to public/external execution;
- do not promote Warrant originality;
- do not broaden the claim beyond the wording in Section 8.

Next decision input:

`AP2 Collision Pass B`

The next engineering direction is selected only after that result and its frozen outcome/reaction matrix are reconciled.

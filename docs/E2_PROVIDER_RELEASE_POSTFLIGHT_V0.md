# E2 Provider Release and Post-flight Conformance v0

Status: **FROZEN BEFORE IMPLEMENTATION**

Purpose: close the second controlled-harness enforcement surface after the official E1-bounded Gate Zero witness, without opening T1 or any external/public execution.

## 1. Entry condition

This slice starts only from the already-proven local state:

`TX_EXECUTED`

under the controlled harness on local Anvil chain 31337.

Required existing artifacts include:

- exact Transition Envelope v0;
- exact Warrant body and detached signature;
- externally configured Warrant issuer trust;
- exact staged payload bytes in S0;
- E1 transaction evidence;
- durable S0 state = `TX_EXECUTED`.

## 2. Provider worker P

The controlled provider worker is a separate local process.

Reference endpoint:

`127.0.0.1:18547`

Properties:

- binds loopback only;
- is not mounted into adversarial client C;
- exposes one protected ingress route for this witness;
- does not expose force-release, S0, signing, trust-configuration, or administrative operations;
- records exactly what bytes it receives;
- is operated by the harness and is not an independent external provider.

The provider identity for the reference witness is the exact address committed as:

`transition.payload.recipient`

## 3. C / provider boundary

Adversarial client C remains in the frozen Docker bridge boundary.

C must attempt direct access to the provider ingress through the host gateway.

Expected:

- provider ingress is unreachable from C because P is bound to host loopback;
- C cannot cause a provider observation directly;
- no provider observation exists before legitimate E2 release.

If C can cause P to record the authoritative payload outside E2, classify:

`BYPASS_OBSERVED`

for the two-surface T0 claim.

This is a controlled network/process-boundary claim, not universal provider security.

## 4. Instance binding

E2 release must not accept a caller-supplied job/instance identity.

The reference local rail derives the job id from the successful transaction receipt emitted by:

`ControlledJobRailV0.JobCreated`

E2/post-flight binding must verify:

- receipt belongs to the authorized transaction hash;
- receipt status is success;
- log address equals committed target;
- event signature is the frozen `JobCreated(uint256,address,address,address,uint256,bytes32,address)`;
- indexed client equals committed protected execution account;
- indexed provider equals committed payload recipient;
- job id is derived from the matching receipt event.

Successful classification:

`INSTANCE_DERIVED_FROM_MATCHING_EXECUTION`

A caller-provided or mismatching job id is never authoritative.

## 5. E2 release inputs

E2 release receives:

- exact Warrant body/signature;
- preconfigured Warrant public trust;
- exact Transition Envelope;
- S0 reference;
- E1 transaction evidence;
- local chain RPC read access;
- provider ingress endpoint.

E2 release does **not** receive new client payload bytes.

The payload to release is read only from the immutable S0 staged-payload record created at `PAYLOAD_STAGED`.

## 6. Release verification

Before release E2 must verify:

1. exact Warrant profile/signature/trust/domain/time under the declared harness time;
2. Warrant transition commitment equals exact Transition Envelope;
3. S0 state is exactly `TX_EXECUTED`;
4. S0 record is bound to the same Warrant body/nonce/transition/domain;
5. immutable staged payload exists;
6. staged payload digest equals committed payload digest;
7. staged recipient/channel/content type equal the committed payload surface;
8. E1 transaction-evidence digest equals the digest bound in S0;
9. chain readback matches committed chain/sender/target/calldata/value;
10. transaction receipt is successful;
11. matching JobCreated event yields the expected client/provider and a derived job id.

Only then may S0 transition:

`TX_EXECUTED -> PAYLOAD_RELEASED`

## 7. Release ordering and partial failure

The v0 order is:

1. verify all transaction/instance evidence;
2. atomically mark `PAYLOAD_RELEASED` in S0 for the exact staged payload digest;
3. send the exact staged payload bytes to P;
4. P records a provider observation.

No state rollback is permitted if provider delivery fails after `PAYLOAD_RELEASED`.

If the protected transaction exists but provider observation is absent or mismatching, the final result is not conformant and must be classified according to the frozen post-flight vocabulary.

## 8. Provider observation

P records:

- exact received payload bytes as a binary artifact;
- SHA-256 and byte length;
- content type;
- provider identity;
- transition commitment;
- derived job id;
- transaction hash;
- observation timestamp from the declared local harness clock.

The observation is:

`RUNTIME_OBSERVED`

inside the closed harness.

It is not independent third-party attestation.

## 9. Independent-process verifier V

A separate verifier process, distinct from E1/E2/P execution code, reads the produced artifacts and recomputes the conformance relation.

V must verify at least:

- canonical PayGod release decision was eligible/authenticated;
- Warrant/transition relationship;
- staged payload digest/bytes;
- transaction proposal versus observed transaction evidence;
- receipt/event-derived instance binding;
- E2 release digest/recipient/context;
- provider observation digest/context;
- one consumed nonce / final S0 state.

Only V may request:

`PAYLOAD_RELEASED -> CONFORMANT`

after all checks succeed.

This is only:

`closed-harness independent-process verification`

not Witness 006 independent external verification.

## 10. Required runtime artifacts

The post-flight directory must contain or immutably reference:

- `request-identity.json`;
- `transition-envelope.json`;
- `warrant-body.json`;
- `warrant.sig`;
- `issuance-audit.json`;
- `authority-state-events.jsonl`;
- `e2-stage.json`;
- `e1-verification.json`;
- `transaction-proposal.json`;
- `transaction-receipt.json`;
- `instance-binding.json`;
- `e2-release.json`;
- `released-payload.bin`;
- `provider-observation.json`;
- `provider-received-payload.bin`;
- `conformance.json`;
- `manifest.json`.

No missing artifact may be silently fabricated.

## 11. Authority-state event evidence

S0 must durably record successful monotonic transitions in the same database boundary.

For the positive witness the exported event sequence must show:

`ISSUED -> PAYLOAD_STAGED -> TX_RESERVED -> TX_EXECUTED -> PAYLOAD_RELEASED -> CONFORMANT`

Each event records:

- issuer key id;
- nonce;
- transition commitment;
- prior state;
- new state;
- event type;
- local harness timestamp;
- requesting component;
- success result.

Failed adversarial attempts remain in their dedicated attack evidence and are not rewritten as successful S0 events.

## 12. Frozen two-surface attacks

This implementation must exercise or explicitly classify:

### A18 — bypass E2 / direct provider ingress

C attempts direct provider delivery.

Expected: unreachable/reject; no provider observation.

### A19 — valid E1, invalid E2

Use valid transaction evidence but a mismatching release surface.

Expected: no `AUTHORIZED_CONFORMANT`; release rejects or final result is nonconformant/partial.

### A20 / A41 — E2 release before E1 success

Attempt release while S0 is only `PAYLOAD_STAGED`.

Expected: reject; provider sees nothing.

### A26 — correct transaction, wrong requirement payload

No client-supplied replacement bytes are accepted at release. Direct wrong-payload provider attempt from C must not create authoritative observation.

### A27 — correct requirement, wrong transaction

Existing E1 transaction-binding tests remain supporting evidence; the post-flight binder must also reject transaction evidence that does not match the committed execution.

### A28 — job correlation substitution

Attempt a mismatching/caller-supplied job identity.

Expected: ignored/rejected because job id is derived from the receipt event.

### A37 — payload recipient substitution

Observed JobCreated provider and P identity must both equal the committed `payload.recipient`.

Mismatch: reject/nonconformant.

### A41 — release before matching transaction evidence

Expected: reject before any provider delivery.

## 13. Success result

The positive controlled-harness run may emit:

`AUTHORIZED_CONFORMANT`

only if:

- official E1 T0 witness has no bypass;
- canonical PayGod decision is eligible;
- Warrant is valid;
- exact E2 staging succeeded;
- exact E1 transaction executed;
- receipt/event binding is exact;
- E2 released only the exact staged bytes;
- P observed exactly those bytes/context;
- V independently recomputed the relation;
- S0 ends at `CONFORMANT`.

## 14. Claim ceiling

If the frozen two-surface attempts and positive path succeed, the maximum claim is:

> Controlled conditional release was runtime-observed under Threat Model T0 across the declared E1 transaction and E2 payload/provider enforcement surfaces of the closed local harness.

Equivalent negative form:

> No bypass was observed under Threat Model T0 across the declared E1 and E2 enforcement surfaces of the closed local harness.

Do not claim:

- universal non-bypassability;
- independent production enforcement;
- ACP/Quiver authority;
- external provider acceptance;
- Warrant originality;
- trusted external time;
- economic fee authority;
- production rollback resistance.

## 15. Stop boundary

After this two-surface closure:

- do not open T1;
- do not build AP2/x402 adapters;
- do not add product/dashboard engineering;

until AP2 Collision Pass B is complete under the frozen review protocol.

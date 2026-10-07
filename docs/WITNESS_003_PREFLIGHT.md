# Witness 003 — PRE-FLIGHT consequence model

Status: **ANALYSIS ONLY**

Witness 002b is closed. Witness 003-LIVE remains **NOT AUTHORIZED**.

This document records what is source-proven about `acp client create-job` before any Agent, Signer, Job, funding, signing, or external execution is allowed.

## Frozen sources

- Workflow Observatory main after Witness 002b closure:
  - merge commit `7648ad87a44bf4430f0178e0b5c05699ff220e15`
- Successful Witness 002b run:
  - `37572490622`
  - source observation run `37474713196`
- ACP CLI:
  - repository `hamadalmunyif/acp-cli`
  - commit `9d2be827cc19e4ea2cecfff3896398607537ea3e`
  - package version `1.0.40`
- ACP SDK:
  - `@virtuals-protocol/acp-node-v2` `0.1.15`
  - exact upstream version commit `392dcc6eb17a6884c214c21aff31afa1b99f45ae`

Classification vocabulary:

- `SOURCE_PROVEN` — established by pinned source code or frozen artifact.
- `DOC_CLAIMED` — stated by upstream documentation but not independently runtime-observed here.
- `RUNTIME_OBSERVED` — actually observed in our own executed witness.
- `UNKNOWN` — not yet established.

## Target offering frozen from Witness 001

The live observation artifact for run `37474713196` contains:

- provider agent: `Quiver`
- provider wallet: `0xd6a5093213d0e940a887ee5327c60af7e53b0261`
- offering: `getCongressTrades`
- active EVM chain: `8453` (Base)
- price type: `fixed`
- price value: `0.01`
- SLA: `5` minutes
- `requiredFunds=false`
- requirements:
  - `ticker`: optional string
  - `limit`: optional number, default 100, maximum 1000
- candidate request already frozen in Witness 002:
  - `{"limit":5}`

Classification: `RUNTIME_OBSERVED` for the frozen marketplace observation. This does **not** independently authenticate Quiver or the economic truth of the offering.

## 1. What `create-job` actually does

### CLI path

Pinned `src/commands/client.ts` performs the v2 path in this order:

1. parse `--requirements` as JSON when possible;
2. call `createAgentFromConfig()`;
3. resolve the active client agent id;
4. look up the provider by wallet address;
5. select the offering by exact name;
6. optionally resolve an active subscription/package;
7. choose evaluator;
8. enter `withApprovalGate(...)`;
9. call `agent.createJobFromOffering(...)`;
10. register the returned job id in local CLI config.

Classification: `SOURCE_PROVEN`.

### Active Agent is mandatory

`createProviderFromConfig()` throws:

`NO_ACTIVE_AGENT`

when no active wallet/agent is configured.

Classification: `SOURCE_PROVEN`.

### Signer is mandatory

The same path throws:

`NO_SIGNER`

when the active agent has no registered public signing key.

The CLI signer delegates P-256 signing to the native `acp-cli-signer` binary; the private key is not returned to the Node.js process.

Classification: `SOURCE_PROVEN`.

## 2. Approval semantics

`create-job` wraps `agent.createJobFromOffering(...)` in `withApprovalGate(...)`.

The gate:

- creates the EVM provider;
- opens the wallet SSE stream;
- runs the requested provider operation;
- can surface a manual approval URL when the wallet layer requests approval.

Classification: `SOURCE_PROVEN`.

However, **manual human approval is not guaranteed for every create-job**. ACP CLI documentation describes signer policies:

- `deny-all`: manual approval for all transactions;
- `restricted`: ACP transactions may be authorized under the policy;
- `unrestricted`: no per-transaction approval restriction.

Therefore:

- approval gate present: `SOURCE_PROVEN`
- manual approval on every create-job: **false as a general claim**
- exact approval behavior for our future signer policy: `UNKNOWN` until policy is deliberately chosen and observed.

## 3. On-chain consequence

ACP SDK 0.1.15 labels job creation as on-chain.

For EVM, `EvmAcpClient.createJob()` prepares a contract call:

`createJob(providerAddress, evaluatorAddress, expiredAt, description, hookAddress)`

against the ACP contract.

The prepared call has native `value=0`.

The SDK then:

- submits the prepared call through `provider.sendCalls(...)`;
- waits for transaction status/hash;
- reads the transaction receipt;
- extracts the job id from the on-chain JobCreated event.

Classification: `SOURCE_PROVEN`.

Therefore `create-job` is **not** a harmless read and is not reversible by simply discarding local state.

## 4. Exact consequence for getCongressTrades

The frozen offering has:

`requiredFunds=false`

Therefore `createJobFromOffering()` selects the normal:

`createJob(...)`

path rather than `createFundTransferJob(...)`.

There is no `session.fund(...)` call in the create-job path. Funding is a separate lifecycle action.

Classification: `SOURCE_PROVEN` for the code path plus `RUNTIME_OBSERVED` for the offering's `requiredFunds=false`.

Important boundary:

- create-job does **not** transfer the 0.01 offering price by itself under this observed path;
- it **does** create a persistent on-chain job state;
- gas sponsorship / who ultimately pays gas remains a separate question.

## 5. Gas and transaction-cost exposure

The ACP EVM adapter routes ACP calls through the server-backed smart-wallet endpoint:

`/wallets/alchemy-rpc`

and the CLI source explicitly describes this path as supporting gas sponsorship.

The actual live transaction still contains gas fields / user-operation semantics and is signed.

Classification:

- gas-sponsorship architecture/path exists: `SOURCE_PROVEN`
- our future create-job is guaranteed to cost the user zero gas: `UNKNOWN`
- exact sponsor/paymaster policy at execution time: `UNKNOWN`
- maximum economic exposure from gas for a live attempt: `UNKNOWN` until bounded before authorization.

No live experiment is allowed while these remain unbounded.

## 6. Evaluator semantics

The SDK itself supports:

- self evaluation;
- third-party evaluation;
- no evaluator / skip-evaluation.

But the pinned ACP CLI EVM `client create-job` explicitly supplies the buyer's own EVM address when `--evaluator` is omitted.

Therefore our default CLI path on Base is **self-evaluation**, not skip-evaluation.

Classification: `SOURCE_PROVEN`.

This matters because later completion/rejection authority belongs to the client/evaluator wallet unless explicitly changed.

## 7. Requirement payload persistence

After on-chain job creation, `createJobFromOffering()` sends the request as a separate message:

- content: `JSON.stringify(requirementData)`
- content type: `requirement`
- job key: `chainId + jobId`

The transport sends it via authenticated REST:

`POST /chats/{chainId}/{jobId}/message`

and history is retrieved via:

`GET /chats/{chainId}/{jobId}/history`

Classification: `SOURCE_PROVEN`.

This creates a split evidence model:

`on-chain job identity`
+
`off-chain/server-held requirement message`

The EVM `createJob` calldata reviewed here does **not** contain a request payload digest.

Classification: `SOURCE_PROVEN`.

## 8. Request -> remote instance binding implication

For Witness 003, a future remote history entry may permit:

`EXACT_OBSERVED`

only if the request evidence retrieved for that specific `chainId/jobId` is byte-exact under the frozen v0 policy.

It must **not** be promoted to:

`EXACT_ATTESTED`

merely because the job id is on-chain.

Reason:

- job creation is independently observable on-chain;
- requirement content is posted separately to the ACP chat service;
- no request digest commitment was found in the reviewed EVM createJob calldata.

A cryptographically independent request-to-job commitment is therefore not established by the current source.

## 9. attempt_id carriage

The pinned `client create-job` interface accepts:

- provider;
- offering name;
- requirements;
- chain id;
- evaluator;
- package id;
- hook.

There is no native `attempt_id` argument.

Classification: `SOURCE_PROVEN`.

Therefore the Observatory's `attempt_id` remains a local correlation key unless we later find an independently observable carrier.

We must not silently inject it into `requirements` because that would change the submitted request and may violate the observed schema.

## 10. Provider notification / burden

Upstream CLI documentation states that when a client creates a job from an offering, the requirement is the first message in the job and can be observed through the event stream or job history.

The SDK transport also exposes server-to-client SSE entries and authenticated history.

Classification:

- requirement is posted into the remote job chat/history: `SOURCE_PROVEN`
- provider receives/observes it through ACP workflow facilities: `DOC_CLAIMED` + source-supported
- exact notification side effect to the provider (push/email/UI burden): `UNKNOWN`

A live Witness 003 would therefore create external state visible to another party.

## 11. Testnet / sandbox

ACP CLI supports:

`IS_TESTNET=true`

which selects testnet chains, testnet API/Privy configuration, and a separate local config file.

Classification: `SOURCE_PROVEN`.

Still unknown:

- whether Quiver / `getCongressTrades` exists on ACP testnet;
- whether a testnet job reaches a real provider or isolated test provider;
- whether testnet chat/history behavior is equivalent enough to establish the same binding claim.

Therefore “testnet exists” does not yet mean “safe equivalent sandbox for this exact witness”.

## 12. Reversibility

Source proves:

- create-job writes on-chain state;
- jobs have expiration/rejection/completion lifecycle states.

Source reviewed here does not establish a delete/undo operation that erases the creation transaction.

Classification:

- persistence of creation transaction: `SOURCE_PROVEN`
- true reversal of job creation: not established
- operational cleanup/cancellation semantics: `UNKNOWN`

## 13. Current PRE-FLIGHT decision

### Proven enough to say

`create-job` is a consequential external transition.

It requires an active agent and signer, passes through an approval-policy gate, submits an on-chain ACP contract call, creates a job id, and then posts the requirement payload into ACP remote chat/history.

### Not proven enough to authorize live execution

The following remain unresolved:

1. exact live gas payer / maximum gas exposure;
2. exact signer policy we would use;
3. whether a safe testnet equivalent exists for the target provider/offering;
4. provider-side notification burden;
5. whether the remote requirement history preserves the exact bytes needed for `EXACT_OBSERVED`;
6. whether any independent evidence can raise the binding beyond `EXACT_OBSERVED`;
7. whether the local `attempt_id` can be externally observed without changing the request;
8. cleanup/reversal semantics after a created job.

## 14. Authorization state

- Witness 002b: **CLOSED / SUCCESS**
- Witness 003-PREFLIGHT: **IN PROGRESS**
- Witness 003-LIVE: **NOT AUTHORIZED**
- ACP Agent creation: **NOT AUTHORIZED**
- Signer creation/registration: **NOT AUTHORIZED**
- Job creation: **NOT AUTHORIZED**
- Funding: **NOT AUTHORIZED**
- Signing: **NOT AUTHORIZED**
- Transaction submission: **NOT AUTHORIZED**

## 15. Next safe work

The next work remains analysis-only:

1. determine exact gas sponsorship/paymaster behavior and bound maximum exposure;
2. determine whether target offering/provider exists on testnet without creating state;
3. define the exact artifact bytes that would be frozen immediately before submission;
4. define post-create readback evidence:
   - transaction hash;
   - chain id;
   - job id;
   - on-chain job fields;
   - first `requirement` history entry;
   - exact byte comparison;
5. predefine the binding result:
   - `EXACT_OBSERVED` only on exact equality;
   - otherwise `CORRELATED_ONLY`;
6. stop and request explicit authorization before any action that creates Agent, Signer, Job, or transaction.

No live action is implied by this document.

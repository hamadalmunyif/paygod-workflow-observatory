# Witness 001 — First Real ACP Browse Observation

Status: **READY FOR MANUAL ACQUISITION**

## Goal

Capture one real ACP marketplace browse observation and convert it into one internal Observation Pack without creating or mutating ACP state.

Success is intentionally narrow:

```text
authenticated ACP browse observation
        ->
captured JSON bytes
        ->
local normalization
        ->
SHA-256 binding
        ->
pack-integrity verification
```

This witness does not attempt to prove provider truth, source authenticity, trusted time, decision correctness, or economic authority.

## Frozen external baseline

- repository: `hamadalmunyif/acp-cli`
- branch: `main`
- commit: `9d2be827cc19e4ea2cecfff3896398607537ea3e`
- package version: `1.0.40`
- `acp-node-v2`: `^0.1.15`

## Source review result

The normal v2 `acp browse` command is **not** suitable for our first signerless witness. In the pinned source it calls:

```text
browse
  -> createAgentFromConfig()
  -> createProviderFromConfig()
  -> configured public signing key required
```

That does not prove that browse signs or mutates, but it places the read operation inside a signer-capable context.

The pinned source also exposes a narrower authenticated read path:

```text
getClient()
  -> resolveToken()
  -> AgentApi
  -> AgentApi.browse()
  -> ApiClient.get()
  -> GET /agents/search
```

This path resolves the stored authenticated session and performs an HTTP GET. In the reviewed fork source it does not construct the EVM signing provider and does not require `createAgentFromConfig()`.

Therefore Witness 001 will use this narrower path, not the stock `acp browse` command.

## Acquisition boundary

The acquisition step remains outside this repository. This repository continues to consume saved/stdin JSON only.

The first witness requires a local clone of the pinned `acp-cli`, its dependencies installed, and an authenticated ACP CLI session. It does **not** require creation of a new job, funding, resource invocation, transaction broadcast, or any modification to the public fork.

No signing action is authorized by Witness 001.

## Capture semantics

The captured file is the exact stdout bytes produced by the frozen acquisition snippet after `AgentApi.browse()` returns.

It is **not** claimed to be the exact HTTP wire representation returned by the ACP server. It is the serialized observation emitted by the acquisition boundary.

The Observation Pack binds those captured bytes exactly and labels external authenticity/truth/time/correctness as `UNKNOWN`.

## Acceptance criteria

Witness 001 closes only when all are true:

1. acquisition runs from the pinned external commit;
2. only `getClient()` + `AgentApi.browse()` are used for the remote read;
3. no explicit signer, wallet-send, funding, job, resource-invocation, or mutation call appears in the acquisition path;
4. stdout is redirected directly to a new capture file;
5. the capture contains no authentication/session material;
6. the private observatory generates an Observation Pack from that file;
7. pack verification succeeds;
8. manifest trust fields remain `UNKNOWN` for authenticity, truth, independent time, and decision correctness;
9. no captured runtime data is committed unless reviewed and explicitly approved.

## Stop condition

If the acquisition path unexpectedly asks for a signer, agent creation, wallet approval, transaction approval, funding, or any state-changing action, stop the witness and record the divergence instead of proceeding.

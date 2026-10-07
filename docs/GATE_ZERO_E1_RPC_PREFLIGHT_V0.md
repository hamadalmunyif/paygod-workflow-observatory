# Gate Zero — E1 RPC Boundary Preflight v0

Status: **PREFLIGHT ONLY — CLIENT CONTAINER DIGEST NOT YET FROZEN**

Purpose: test whether adversarial client C can create the protected local transaction consequence without E1 by exploiting the local RPC boundary or an alternate signer.

This preflight is intentionally run before PayGod decision, Warrant issuance, E2 staging, or legitimate E1 execution.

## Topology

- R-admin: Anvil on host loopback only, port 18545.
- R-client: fail-closed proxy on port 18546.
- C: Docker bridge container, no host networking, no Docker socket, no secret mounts.
- C sees R-client and attempts R-admin through the Docker host gateway.
- C receives only public transition facts and an unprivileged/known development account.
- protected execution private key remains outside C.

## R-client rule

R-client forwards only the frozen allowlist from `LOCAL_EVM_RPC_BOUNDARY_V0.md`.

In particular:

- `eth_sendRawTransaction` is allowed;
- signing, unlocked-account, personal, Anvil/admin, debug, EVM-control and unknown methods are rejected locally.

R-client contains no PayGod/Warrant logic.

## Preflight attacks

### A51 — privileged RPC

C calls representative forbidden methods through R-client.

Expected:

- deterministic proxy error `-32099`;
- audit event says `forwarded=false`.

### A52 — direct R-admin

C attempts JSON-RPC directly against host-gateway port 18545.

Expected:

- network unreachable from C because Anvil is loopback-bound.

### A53 — node-managed protected signing

C attempts node-managed transaction/signature methods for the public protected account.

Expected:

- local R-client rejection;
- no protected signature or transaction.

### A54 / A0 / A17 — alternate raw transaction path

C locally signs the exact protected target/calldata/value with a different account and submits the raw transaction through the intentionally allowed `eth_sendRawTransaction` path.

Expected:

- raw transaction path is genuinely reachable;
- surrogate contract rejects the alternate sender;
- receipt has failure status;
- `nextJobId` remains unchanged;
- protected consequence is not observed.

This demonstrates that success is not caused merely by blocking transaction submission at the proxy.

## Preflight-only limitation

The first run uses a named Node container tag only to discover and record its immutable repository digest.

Therefore its result is not promoted to a frozen Gate Zero witness.

After the observed image digest is pinned in the workflow, the attacks must be rerun before a witness result can be recorded.

## Claim ceiling

A successful preflight supports only:

> The proposed adversarial-client/RPC topology executed the intended E1 bypass attempts without observing a protected consequence, subject to rerun after the C container image digest is frozen.

It does not establish Gate Zero PASS, E2/provider exclusivity, or Conditional Release Authority.

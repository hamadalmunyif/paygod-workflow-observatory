# Gate Zero — E1 RPC Boundary Preflight v0

Status: **PREFLIGHT ONLY — CLIENT IMAGE FROZEN; FULL T0 ATTACK SET NOT YET COMPLETE**

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

## Frozen client image

The adversarial client image is pinned to:

`node@sha256:0e5f906573693feaa1e21057ebdcfdb5bd5021f050b2dc7c9deceb629c7da2a8`

The workflow verifies the observed repository digest before running C.

## Remaining preflight limitation

This document covers the RPC/alternate-signer subset only.

It is not promoted to the final Gate Zero witness until the separately frozen T0 attack set also covers:

- protected-key reachability from C;
- S0 reachability/mutation from C;
- valid-Warrant payload substitution through E2;
- restart/replay/concurrent-use attempts;
- explicit recording of any T0 attack not executed.

Therefore a successful rerun after the image pin remains a bounded RPC preflight, not a full Gate Zero PASS.

## Claim ceiling

A successful preflight supports only:

> The frozen-client adversarial RPC topology executed the declared E1 RPC/alternate-signer bypass attempts without observing a protected consequence. This remains a preflight because the full frozen T0 attack set has not yet been executed.

It does not establish Gate Zero PASS, E2/provider exclusivity, or Conditional Release Authority.

# Local EVM RPC Boundary v0

Status: **FROZEN BEFORE SLICE 2 IMPLEMENTATION**

Purpose: make Gate Zero direct-RPC attacks meaningful while preventing development-node administrative powers from becoming accidental client authority.

## 1. Reference topology

The reference CI harness uses one Linux runner with process/container separation:

```text
                         host / operator boundary
                ┌────────────────────────────────┐
                │                                │
                │  Anvil R-admin                 │
                │  127.0.0.1:18545               │
                │       ▲                        │
                │       │                        │
                │   ┌───┴────┐       E1          │
                │   │ R-client│       protected  │
                │   │ proxy   │       executor   │
                │   └───┬────┘                   │
                │  0.0.0.0:18546                 │
                └───────┼────────────────────────┘
                        │
                 Docker bridge only
                        │
                ┌───────▼────────┐
                │ adversarial C  │
                │ no host net    │
                │ no docker sock │
                └────────────────┘
```

Ports are reference defaults and may change only before the witness profile is frozen.

## 2. R-admin

Reference endpoint:

`http://127.0.0.1:18545`

Requirements:

- Anvil binds only to host loopback;
- not published into C's container namespace;
- not bound to `0.0.0.0`;
- no host-network mode for C;
- no Docker socket mounted to C;
- no SSH/runner control surface exposed to C.

R-admin may be used by:

- pre-witness operator setup;
- E1 transaction submission/readback;
- post-flight verifier readback.

After witness freeze, operator mutation through R-admin invalidates the run.

## 3. R-client

Reference endpoint visible to C:

`http://harness-host:18546`

where `harness-host` resolves to the Docker host gateway for the isolated client container.

The proxy forwards allowed JSON-RPC calls to:

`http://127.0.0.1:18545`

The proxy performs no PayGod/Warrant/policy enforcement.

## 4. Request profile

R-client v0 accepts only:

- HTTP POST;
- Content-Type JSON;
- one JSON-RPC request object per HTTP request;
- `jsonrpc == "2.0"`;
- scalar id of string/number/null;
- non-empty string method;
- params absent, array, or object.

R-client v0 rejects JSON-RPC batch arrays.

Reason: batch semantics add no value to Gate Zero and create avoidable policy ambiguity.

## 5. Fail-closed method allowlist

The exact v0 allowlist is:

- `eth_chainId`
- `eth_blockNumber`
- `eth_getBlockByNumber`
- `eth_getTransactionByHash`
- `eth_getTransactionReceipt`
- `eth_getLogs`
- `eth_getCode`
- `eth_getBalance`
- `eth_getTransactionCount`
- `eth_call`
- `eth_estimateGas`
- `eth_sendRawTransaction`
- `net_version`

Any other method is rejected locally.

The proxy must not forward a disallowed method even if Anvil would reject it anyway.

## 6. Explicitly relevant rejected methods

The frozen attacks must include attempts for:

- `eth_sendTransaction`
- `eth_sign`
- `eth_signTransaction`
- representative `personal_*`
- representative `anvil_*`
- representative `evm_*`
- representative `hardhat_*`
- representative `debug_*`

Because the implementation is allowlist-based, this list is illustrative rather than exhaustive.

## 7. Raw transaction rule

`eth_sendRawTransaction` remains allowed.

This is essential.

C must be able to submit a transaction it can independently sign. Otherwise direct-RPC Gate Zero would be weakened by network policy rather than enforcement architecture.

The security question is therefore:

> Can C obtain or construct a valid transaction from the protected execution account without E1?

not:

> Can C send any transaction to the node?

## 8. Protected account

The protected E1 address is not unlocked by Anvil.

R-client must never expose a node-managed signing path for that address.

The protected private key is:

- generated outside Anvil;
- stored only in E1/operator-secret boundary;
- not passed to the proxy;
- not mounted into C;
- not logged;
- not included in witness artifacts.

Public address exposure is expected and not sensitive.

## 9. Client container boundary

C runs without:

- `--network host`;
- privileged mode;
- Docker socket;
- host PID namespace;
- host filesystem mounts containing E1/issuer/D keys or S0 state.

C may have outbound connectivity to the R-client proxy and other explicitly declared attack endpoints.

C must not be artificially prevented from sending arbitrary bytes or constructing its own secp256k1 keys.

## 10. Direct R-admin attack

A52 is executed from inside the same C container used for Gate Zero.

C attempts connection to the host gateway at R-admin port `18545`.

Expected:

- connection cannot reach Anvil because Anvil is loopback-bound.

The test must distinguish:

- DNS failure;
- TCP connection failure;
- HTTP/RPC rejection.

For the reference boundary, success requires **network unreachability**, not merely RPC method rejection.

## 11. Privileged-method attack

A51 sends forbidden JSON-RPC methods to R-client.

Expected:

- deterministic proxy rejection code;
- zero forwarding to R-admin.

The proxy should maintain a local audit event containing:

- request id;
- method;
- decision = rejected;
- reason code;
- no secret data.

The audit log is local harness evidence, not independent truth.

## 12. Proxy failure behavior

If R-admin is unavailable:

- allowed R-client calls fail closed;
- the proxy does not synthesize chain responses.

If request parsing fails:

- reject locally.

If method is unknown:

- reject locally.

If upstream response is malformed:

- surface proxy/upstream failure;
- do not rewrite it into a successful JSON-RPC result.

## 13. Proxy implementation boundary

Reference implementation language:

- Node.js 22;
- standard-library HTTP/fetch facilities where sufficient;
- no wallet library;
- no private keys;
- no PayGod code;
- no Warrant verifier.

This keeps R-client as a transport boundary rather than another authority component.

## 14. E1 boundary

E1 may access R-admin directly.

E1 must not expose its R-admin access as an arbitrary relay to C.

E1 protected operation accepts the frozen transition/Warrant context only; generic JSON-RPC forwarding is forbidden.

Therefore:

`C -> E1 -> arbitrary R-admin method`

must not exist.

## 15. Witness evidence

The Slice 2 witness must record:

- Anvil listening address/port;
- proxy listening address/port;
- proxy allowlist digest;
- C container network mode;
- absence of Docker socket mount;
- A51 result;
- A52 result;
- protected account address;
- proof the protected address is absent from node-managed account enumeration if that method is used during setup;
- raw transaction bypass attempts through R-client.

## 16. Claim boundary

This boundary supports only:

> C did not observe a route to R-admin and privileged dev-node RPC methods were rejected by R-client under the frozen local harness topology.

It does not prove absence of host/root escape or arbitrary container-runtime compromise.

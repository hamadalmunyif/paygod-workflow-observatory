# Local EVM Rail v0

Status: **FROZEN BEFORE SLICE 2 IMPLEMENTATION**

Purpose: define the local EVM rail used by the controlled harness before E1/E2 code is allowed to depend on it.

This rail is a controlled surrogate. It is not ACP and does not prove ACP-native enforcement.

## 1. Runtime pin

Reference local EVM runtime:

- project: `foundry-rs/foundry`
- release: `v1.8.5`
- tag commit: `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`
- CI platform: `linux_amd64`
- release asset: `foundry_v1.8.5_linux_amd64.tar.gz`
- required asset SHA-256:
  `6c66ffcc55fa4249197721baa3098bc208014ea1d8aa04b2ed50ac6bccffb226`

The implementation workflow must verify the archive SHA-256 before extraction.

No `latest`, nightly, floating installer, or unpinned Foundry toolchain is permitted for the reference witness.

## 2. Chain profile

- EVM chain id: `31337`
- no fork URL;
- no mainnet/testnet upstream;
- no Base connection;
- no ACP connection;
- no economically valuable asset.

The chain exists only for the controlled witness epoch.

## 3. Split RPC boundary

Anvil's raw RPC is an administrative development endpoint and is **not** the client RPC.

The harness therefore has two logical RPC surfaces:

### R-admin

Direct Anvil RPC.

Reachable only by:

- operator setup before witness freeze;
- E1 for its protected submission/readback path;
- post-flight verifier when explicitly required.

Not reachable by C.

R-admin may expose Anvil development/admin methods. Their existence is a declared property of the dev rail, not authority granted to C.

### R-client

A method-filtering RPC proxy exposed to adversarial client C.

R-client is the only chain endpoint routable from C.

The proxy is fail-closed: any method not explicitly allowed is rejected locally and is not forwarded to Anvil.

## 4. R-client allowed methods

The minimum v0 allowlist is:

- `eth_chainId`
- `eth_blockNumber`
- `eth_getBlockByNumber`
- `eth_getTransactionByHash`
- `eth_getTransactionReceipt`
- `eth_getLogs`
- `eth_getCode`
- `eth_call`
- `eth_estimateGas`
- `eth_sendRawTransaction`
- `net_version`

`eth_sendRawTransaction` is deliberately allowed.

This permits C to attempt a real direct-RPC bypass using any raw transaction it can independently sign.

## 5. R-client forbidden methods

The proxy must reject at least:

- `eth_sendTransaction`
- `eth_sign`
- `eth_signTransaction`
- `personal_*`
- `anvil_*`
- `evm_*`
- `hardhat_*`
- `debug_*`
- `miner_*`
- `txpool_*`

The deny list is explanatory; the actual implementation is allowlist-based.

Therefore a new or unknown RPC method is rejected by default.

## 6. Protected execution account

E1 uses one externally generated secp256k1 EVM account:

`protected_execution_account`

Requirements:

- the private key is generated outside Anvil;
- it is not one of Anvil's unlocked/default development accounts;
- it is not mounted into C;
- it is not returned through any generic signing endpoint;
- it is committed in `Transition Envelope v0.transaction.execution_account`.

Before the witness epoch begins, the operator may fund this address with valueless local-chain currency through R-admin.

After boundary freeze, operator/admin mutation invalidates the witness.

## 7. Default Anvil accounts

The harness does not treat Anvil default-account secrecy as a security property.

C may know or reconstruct default development account keys.

Therefore no authority claim may depend on those accounts being secret.

The protected transition is defined so that default/alternate accounts cannot produce the same protected result.

## 8. Surrogate contract

The exact contract semantics and compiler profile are frozen in:

- `LOCAL_EVM_SURROGATE_CONTRACT_V0.md`

Reference compiler:

- Solidity `0.8.30+commit.73712a01`
- tag commit `73712a01b2de56d9ad91e3b6936f85c90cb7de36`
- linux-amd64 SHA-256 `f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7`

The exact RPC/network boundary is frozen in:

- `LOCAL_EVM_RPC_BOUNDARY_V0.md`

### Contract role

The local rail deploys one controlled contract:

`ControlledJobRailV0`

It preserves the split-channel property discovered in ACP.

Logical interface:

```solidity
createJob(
    address provider,
    address evaluator,
    uint256 expiredAt,
    string description,
    address hook
) external returns (uint256 jobId)
```

The requirement payload is **not** included in this calldata and no requirement-payload digest is stored by this call.

This is deliberate.

## 9. Protected contract invariant

The contract is deployed with immutable:

`authorizedClient = protected_execution_account`

`createJob(...)` must revert unless:

`msg.sender == authorizedClient`

The contract also requires:

`msg.value == 0`

The protected transaction consequence is therefore:

> a successful `createJob` state transition emitted by `ControlledJobRailV0` with `client == protected_execution_account`, exact committed transaction fields, and the expected controlled provider.

A similar transaction from another account is not byte-identical authority exercise.

If an in-scope alternate route can nevertheless cause the contract to record the protected client as the protected execution account without E1, Gate Zero fails.

## 10. Job identity

The contract assigns a monotonically increasing local `jobId` and emits an event containing at least:

- job id;
- client;
- provider;
- evaluator;
- expiry;
- hook;
- a description commitment or equivalent event field sufficient for post-flight comparison.

The post-flight binder derives the instance id from the receipt/event.

The future job id is not placed into the pre-execution Transition Envelope.

## 11. Provider identity

The provider address used in `createJob` must equal:

`Transition Envelope v0.payload.recipient`

This equality is checked in post-flight conformance.

The requirement bytes themselves remain a separate E2 surface.

## 12. Setup epoch

Before each witness, the operator may:

1. start pinned Anvil;
2. deploy the surrogate contract;
3. generate the protected E1 account;
4. fund it with local valueless currency;
5. record contract address and protected account;
6. start R-client proxy;
7. verify C cannot route to R-admin;
8. freeze component/config digests.

After this freeze, any operator mutation of chain state, account keys, RPC policy, or contract configuration invalidates the witness.

## 13. Gate Zero attacks enabled by this rail

The rail must permit meaningful attempts for at least:

- A0 — bypass PayGod/E1 through direct client RPC;
- A1 — find an unrestricted signing path;
- A2 — substitute another signer/account;
- A10/A36 — change transaction or execution account;
- A17 — bypass E1 transaction enforcement;
- privileged-RPC attempt — call forbidden Anvil/admin methods through R-client;
- direct-admin-route attempt — connect from C to R-admin.

A privileged method accepted through R-client is a harness boundary failure.

C reaching R-admin directly is a harness boundary failure.

## 14. Why R-client is not PayGod enforcement

R-client exists to make a development node resemble a public RPC endpoint rather than an unlocked local wallet.

It does **not** evaluate:

- PayGod decision;
- Warrant;
- transition commitment;
- evidence;
- policy.

E1 remains the transaction authority-enforcement component.

The RPC proxy only removes dev-node administrative powers that would not normally be available from a public RPC endpoint.

## 15. Non-claims

Passing the local rail does not prove:

- public-chain behavior in every detail;
- smart-account enforcement;
- HSM/MPC isolation;
- ACP contract equivalence;
- Base-specific behavior;
- absence of host/root compromise;
- portability.

It exists only to make Slice 2 falsifiable without letting the dev-chain's administrative conveniences trivialize Gate Zero.

# ControlledJobRailV0 — Surrogate Contract Specification

Status: **FROZEN BEFORE IMPLEMENTATION**

Purpose: define the exact local contract semantics used to falsify E1 transaction enforcement while preserving the split-channel structure observed in ACP.

This contract is a controlled surrogate. It is not ACP and must never be described as ACP-compatible beyond the explicitly copied call shape.

## 1. Compiler profile

Reference compiler:

- Solidity: `0.8.30`
- long version: `0.8.30+commit.73712a01`
- tag commit: `73712a01b2de56d9ad91e3b6936f85c90cb7de36`
- linux-amd64 build:
  `solc-linux-amd64-v0.8.30+commit.73712a01`
- SHA-256:
  `f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7`
- Keccak-256:
  `c47307cc6d212f7d86af1ad07800f9ed4715454a1c327a7258e62d769ec8bdc1`

The implementation workflow must verify the compiler binary against the frozen SHA-256 before use.

## 2. Language / build constraints

The implementation source must declare:

`pragma solidity 0.8.30;`

Reference build settings:

- optimizer: disabled;
- metadata bytecode hash: `none` where supported;
- EVM version: `cancun`;
- no libraries;
- no proxy;
- no delegatecall;
- no upgrade path.

Any compiler/build-setting change changes the contract profile and requires a new source/code hash.

Reference implementation source:

`contracts/ControlledJobRailV0.sol`

Frozen custom errors:

- `ZeroAuthorizedClient()`
- `UnauthorizedCaller(address)`
- `NonZeroValue(uint256)`
- `ZeroProvider()`
- `JobNotFound(uint256)`

## 3. Constructor

Logical constructor:

```solidity
constructor(address authorizedClient)
```

Requirements:

- `authorizedClient != address(0)`;
- store as immutable `authorizedClient`;
- no owner/admin role;
- no setter;
- no privileged post-deployment configuration.

## 4. State

Minimum state:

```solidity
address public immutable authorizedClient;
uint256 public nextJobId;
mapping(uint256 => Job) private jobs;
```

Logical Job fields:

```solidity
struct Job {
    address client;
    address provider;
    address evaluator;
    uint256 expiredAt;
    bytes32 descriptionHash;
    address hook;
}
```

`nextJobId` starts at `1`.

No payload bytes or payload digest are stored by the transaction surface.

## 5. Protected operation

Exact logical interface:

```solidity
function createJob(
    address provider,
    address evaluator,
    uint256 expiredAt,
    string calldata description,
    address hook
) external payable returns (uint256 jobId)
```

Required preconditions:

1. `msg.sender == authorizedClient`;
2. `msg.value == 0`;
3. `provider != address(0)`.

No requirement-payload digest parameter exists.

The function must not call an external contract.

## 6. State transition

On success:

1. assign `jobId = nextJobId`;
2. increment `nextJobId` by one;
3. store:
   - `client = msg.sender`
   - exact `provider`
   - exact `evaluator`
   - exact `expiredAt`
   - `descriptionHash = keccak256(bytes(description))`
   - exact `hook`
4. emit the frozen event.

No other persistent state transition is permitted.

## 7. Event

Exact logical event:

```solidity
event JobCreated(
    uint256 indexed jobId,
    address indexed client,
    address indexed provider,
    address evaluator,
    uint256 expiredAt,
    bytes32 descriptionHash,
    address hook
);
```

The post-flight binder derives the local instance id from this event.

The event does not attest to E2 payload delivery.

## 8. Readback

The implementation must expose a read-only function sufficient for post-flight verification:

```solidity
function getJob(uint256 jobId)
    external
    view
    returns (
        address client,
        address provider,
        address evaluator,
        uint256 expiredAt,
        bytes32 descriptionHash,
        address hook
    );
```

A missing job id must not fabricate a populated job.

Missing job ids revert with `JobNotFound(uint256)`.

## 9. Revert conditions

The implementation must use distinct, testable revert conditions for at least:

- unauthorized caller;
- non-zero native value;
- zero provider.

The exact Solidity error names/selectors must be frozen with the source before execution tests.

## 10. Protected consequence definition

For Slice 2, the **protected transaction consequence** is not merely “a transaction succeeded”.

It is:

> `ControlledJobRailV0` records and emits one JobCreated instance whose client is the frozen protected execution account and whose provider/evaluator/expiry/descriptionHash/hook match the exact calldata committed in the Transition Envelope.

Therefore:

- a revert is not the protected consequence;
- a call from another account is not the protected consequence;
- a job with changed fields is not the same protected consequence;
- a job created by the protected account through an alternate signing/execution path **is** a Gate Zero bypass candidate.

## 11. Split-channel invariant

The transaction surface intentionally does not include:

- requirement payload bytes;
- requirement payload SHA-256;
- Warrant nonce;
- PayGod decision digest.

This preserves the architectural problem discovered in ACP: the transaction surface and payload surface remain distinct.

Their common binding exists in PayGod's Transition Envelope/Warrant, not in the surrogate contract.

## 12. Post-flight requirements

A conformant E1 result must preserve enough evidence to verify:

- tx hash;
- chain id;
- sender;
- contract target;
- exact calldata bytes;
- native value;
- receipt status;
- block hash/number;
- JobCreated event fields;
- getJob readback fields;
- contract runtime code hash;
- protected execution account;
- transition commitment.

The verifier compares these to the exact preflight Transition Envelope.

## 13. Forbidden additions

The v0 contract must not add:

- PayGod signature verification;
- Warrant parsing;
- request payload verification;
- policy evaluation;
- admin bypass;
- owner override;
- alternate authorized callers;
- meta-transaction forwarder;
- ERC-4337 module;
- permit/session-key path;
- upgradeability.

Those would change the experiment from “E1 outside the contract” into a different enforcement architecture.

## 14. Falsification relevance

The contract exists to make the following questions meaningful:

- can C produce the protected account's transaction without E1?
- can C obtain a protected-account signature elsewhere?
- can C exploit dev-node/admin RPC to impersonate the protected account?
- can C alter committed calldata after Warrant issuance?
- can an alternate account create the same protected contract consequence?

If the contract itself contains a bypass around `authorizedClient`, the witness is a harness defect, not an authority result.

## 15. Claim boundary

Successful use of this surrogate proves only local controlled behavior under T0.

It does not prove equivalence to ACP contracts, Base execution, smart accounts, or third-party enforcement.

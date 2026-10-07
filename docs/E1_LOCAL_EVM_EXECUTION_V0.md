# E1 Local EVM Execution v0

Status: **IMPLEMENTATION SLICE — ENDS AT TX_EXECUTED**

Purpose: execute one exact locally authorized transaction through E1 after E2 staging and E1 reservation, using a protected secp256k1 account that is not unlocked by Anvil.

## 1. Scope

This slice extends:

`PAYLOAD_STAGED -> TX_RESERVED -> TX_EXECUTED`

It does not release the staged payload and does not invoke a provider.

## 2. Local rail only

Reference rail:

- Anvil from Foundry v1.8.5;
- chain id 31337;
- loopback R-admin only;
- no fork URL;
- no public/testnet/mainnet endpoint;
- no economically valuable asset.

## 3. Protected execution key

The protected execution private key is generated outside Anvil for the witness epoch.

Requirements:

- not one of Anvil's unlocked accounts;
- stored only in runner/operator temporary secret storage;
- never written under the uploaded evidence directory;
- never returned by E1;
- deleted after the execution step;
- its public address is committed in Transition Envelope v0.

E1 derives the public address from the private key and rejects if it differs from the committed execution account.

## 4. Surrogate contract

The slice deploys:

`contracts/ControlledJobRailV0.sol`

using the frozen Solidity 0.8.30 compiler profile with EVM version `cancun`.

Deployment is setup activity through R-admin before the protected transition.

The deployed contract address becomes the Transition Envelope target.

## 5. Real calldata

The protected action uses actual ABI calldata generated for:

`createJob(address,address,uint256,string,address)`

The exact calldata bytes are hashed into Transition Envelope v0 before PayGod decision and Warrant issuance.

The transaction proposal artifact preserves the exact calldata hex used later by E1.

## 6. E1 sequence

E1:

1. loads exact Warrant / trust / Transition Envelope / transaction proposal;
2. derives protected account address from the private key;
3. verifies address equals `transaction.execution_account`;
4. invokes E1 reservation verification;
5. S0 atomically moves `PAYLOAD_STAGED -> TX_RESERVED`;
6. E1 invokes pinned `cast send --data` internally;
7. caller does not choose nonce/gas/fee fields;
8. caller does not receive a signature;
9. E1 reads transaction and receipt from R-admin;
10. E1 verifies chain, sender, target, exact calldata, native value, and success status;
11. E1 hashes the observed transaction evidence;
12. S0 moves `TX_RESERVED -> TX_EXECUTED`.

## 7. Failure semantics

If reservation fails:

- no signing/submission occurs;
- S0 remains `PAYLOAD_STAGED`.

If failure occurs after `TX_RESERVED`:

- the nonce remains consumed;
- the slice must not silently return to `PAYLOAD_STAGED`;
- the run is not conformant merely because a transaction may have been attempted.

A later post-flight slice may classify partial/nonconformant external state more precisely.

## 8. Operational transaction metadata

The caller supplies none of:

- account nonce;
- gas limit;
- gas price;
- max fee;
- priority fee;
- raw signed transaction;
- signature.

Pinned Foundry derives the local transaction mechanics internally.

This is not an economic fee-control claim.

## 9. Evidence

The slice preserves:

- exact Transition Envelope;
- exact transaction proposal;
- transaction hash;
- observed chain id;
- observed sender;
- observed target;
- observed input/calldata;
- observed native value;
- receipt status;
- block hash/number;
- transaction-evidence SHA-256;
- final S0 state.

It does not preserve the execution private key.

## 10. Claim ceiling

A successful slice supports only:

> One exact Warrant-bound local EVM transaction was reserved through E1, signed internally by the protected local execution key, observed on chain with matching transaction fields, and recorded as TX_EXECUTED in S0.

It does not establish:

- Gate Zero;
- absence of alternate signing paths;
- R-client / R-admin isolation;
- provider payload release;
- post-flight conformance across both surfaces;
- ACP / Quiver enforcement;
- public-chain or economic authority.

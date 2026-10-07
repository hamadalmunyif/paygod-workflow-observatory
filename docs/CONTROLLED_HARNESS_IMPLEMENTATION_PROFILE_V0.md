# Controlled Harness Implementation Profile v0

Status: **FROZEN IMPLEMENTATION PROFILE — LOCAL ONLY**

Purpose: remove representation and runtime ambiguity before any controlled-harness code is written.

This profile authorizes nothing by itself.

## 1. Runtime scope

The first implementation target is a **local-only closed harness**.

It must not connect to:

- Base mainnet;
- Base Sepolia;
- ACP production;
- ACP testnet;
- Quiver;
- any third-party provider;
- any real funded wallet.

The EVM surface is a local EVM-compatible development chain only.

Reference chain id:

`31337`

The exact local rail is frozen in:

`LOCAL_EVM_RAIL_V0.md`

Reference runtime:

- Foundry/Anvil `v1.8.5`
- tag commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`
- reference CI asset `foundry_v1.8.5_linux_amd64.tar.gz`
- required asset SHA-256 `6c66ffcc55fa4249197721baa3098bc208014ea1d8aa04b2ed50ac6bccffb226`

The implementation workflow must verify this digest before extraction.

The adversarial client must not receive Anvil raw/admin RPC. Its chain access is the fail-closed R-client proxy defined by `LOCAL_EVM_RAIL_V0.md` and `LOCAL_EVM_RPC_BOUNDARY_V0.md`.

The exact surrogate contract/compiler profile is frozen in `LOCAL_EVM_SURROGATE_CONTRACT_V0.md`:

- Solidity `0.8.30+commit.73712a01`;
- solc linux-amd64 SHA-256 `f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7`;
- no requirement-payload digest in transaction calldata;
- immutable protected execution account;
- no admin/upgrade/bypass path.

## 2. Local transaction model

The local chain hosts a controlled test contract that intentionally preserves the split-channel property observed in ACP.

The contract exposes an ACP-like operation shaped as:

`createJob(provider, evaluator, expiredAt, description, hook)`

The transaction calldata does **not** contain the requirement payload digest.

The contract emits a job/instance creation event from which a post-flight instance id can be derived.

This contract is a controlled surrogate, not ACP.

Passing against it proves only the closed harness architecture.

## 3. Protected execution account

E1 owns one dedicated local EVM execution account.

Requirements:

- key type: secp256k1 EVM account;
- private key generated for the local harness epoch;
- key material available only to E1;
- protected account address committed as `transaction.execution_account`;
- the client C never receives the private key or a generic signing operation.

The local chain setup may fund the E1 account with valueless development-chain currency.

Funding on the local chain has no economic claim.

## 4. Controlled provider identity

The provider has one dedicated controlled EVM address/identity for the harness.

`payload.recipient` is the lowercase provider EVM address.

The local createJob calldata must name the same provider address.

Post-flight conformance verifies that the emitted job/instance provider equals the committed payload recipient.

This cross-surface equality is a conformance rule, not something E1 or E2 must infer from PayGod evidence.

## 5. Transition Envelope byte profile

File:

`transition-envelope.json`

Encoding:

- UTF-8;
- no BOM;
- compact JSON;
- no trailing LF;
- exact field order defined below;
- no insignificant whitespace.

Top-level field order:

1. `schema`
2. `request_identity_sha256`
3. `transaction`
4. `payload`

Transaction field order:

1. `system`
2. `chain_id`
3. `execution_account`
4. `target`
5. `calldata_sha256`
6. `native_value`

Payload field order:

1. `channel`
2. `recipient`
3. `content_type`
4. `payload_sha256`

All SHA-256 digest values are exactly 64 lowercase hexadecimal characters without a prefix.

All EVM addresses are normalized to lowercase `0x` + 40 hexadecimal characters before freezing.

`native_value` is a base-10 string in wei.

The transition commitment is:

`SHA256(exact transition-envelope.json bytes)`

## 6. Warrant body byte profile

File:

`warrant-body.json`

Encoding:

- UTF-8;
- no BOM;
- compact JSON;
- no trailing LF;
- fixed field order.

Field order:

1. `schema`
2. `enforcement_domain`
3. `transition_commitment`
4. `not_before`
5. `expires_at`
6. `nonce`
7. `issuer_key_id`

`not_before` and `expires_at` are JSON integer Unix epoch milliseconds.

`nonce` is 32 cryptographically random bytes represented as 64 lowercase hexadecimal characters.

Fixed v0 enforcement domain:

`controlled-harness/t0-v0`

## 7. Issuer signature profile

Warrant v0 issuer algorithm:

`Ed25519`

The dedicated issuer key pair is generated for the controlled harness epoch.

Public key representation for identity:

DER SubjectPublicKeyInfo (SPKI) bytes.

`issuer_key_id` is:

`ed25519-spki-sha256:<hex>`

where `<hex>` is SHA-256 over the exact DER SPKI bytes.

The issuer signs the exact bytes of `warrant-body.json`.

Detached signature file:

`warrant.sig`

Compact JSON field order:

1. `alg`
2. `issuer_key_id`
3. `signature_base64`

with:

- `alg = "Ed25519"`;
- `signature_base64` = base64 encoding of the raw Ed25519 signature bytes;
- no trailing LF.

## 8. Trusted issuer profile

E1 and E2 receive a read-only trust record containing:

- enforcement domain;
- issuer key id;
- exact DER SPKI public-key bytes or lossless encoding thereof;
- algorithm = Ed25519.

The client may know the public key.

The client may not mutate the verifier trust record through any supported T0 path.

## 9. Harness time profile

Time classification:

`HARNESS_LOCAL_WALL_CLOCK`

S0 is the single time reference used for warrant state transitions.

S0 obtains time from its local system wall clock as Unix epoch milliseconds.

E1/E2 use the time result evaluated by S0 as part of the relevant state transition rather than independently claiming authoritative time.

This proves consistent local harness time use only.

It does not establish trusted external time.

## 10. Issuance registration

Warrant issuance is not complete merely when a signature exists.

The controlled issuance sequence is:

1. canonical eligible PayGod decision is verified;
2. exact Transition Envelope is frozen;
3. issuer obtains/uses the S0 harness time;
4. issuer generates a fresh 32-byte nonce;
5. issuer freezes and signs `warrant-body.json`;
6. issuer submits an `ISSUED` registration to S0 containing:
   - issuer key id;
   - nonce;
   - transition commitment;
   - enforcement domain;
   - not-before;
   - expires-at;
   - warrant-body digest;
7. S0 atomically rejects duplicate `issuer_key_id + nonce`;
8. only after successful S0 registration may the Warrant artifacts be returned to C.

A signed warrant whose S0 registration failed is not an issued warrant for the harness.

## 11. S0 record uniqueness

Primary logical identity:

`issuer_key_id + nonce`

S0 must reject:

- same nonce with different transition commitment;
- same nonce with different domain;
- duplicate registration;
- attempt to recreate a terminally consumed nonce.

## 12. Local EVM direct-RPC attack condition

C is allowed to reach the local EVM RPC for Gate Zero attack attempts.

Direct RPC reachability alone is not a bypass.

A bypass occurs if C can cause the protected execution account, or an in-scope equivalent authority path, to produce the protected consequential transition without satisfying E1/Warrant enforcement.

## 13. Provider channel profile

The authoritative provider payload path is:

`C -> E2 stage -> E1 execution -> E2 release -> P`

P's protected requirement handler accepts authoritative payload only from E2's release path.

C may attempt direct provider calls as attacks.

If P treats such a payload as the protected requirement, record `BYPASS_OBSERVED`.

## 14. Implementation language boundary

The repository continues to support Node >=20.19 for general observatory functions.

The **reference authority harness runtime is Node 22** because S0 uses `node:sqlite`. Node 20 CI may validate non-S0 code paths, but it is not a reference runtime for the authority harness.

The implementation should prefer standard-library cryptography for issuer signing/verification where practical.

Any new dependency must be justified by the execution surface it implements and pinned through the repository lockfile.

## 15. Local rail boundary required for Slice 2

Before E1/E2 execution tests begin, the witness must record:

- Anvil binary/release identity;
- archive digest verification result;
- chain id 31337;
- protected execution account;
- surrogate contract address/code hash;
- R-client allowlist;
- proof that C cannot route to R-admin;
- frozen attack-catalogue version including A51-A54.

A failure of R-client filtering or R-admin isolation is a harness boundary failure, not an E1 pass.

## 16. Still unresolved by this profile

This profile does not solve:

- hardware key isolation;
- host/root compromise;
- production issuer rotation/revocation;
- trusted external time;
- third-party enforcement;
- ACP-native payload enforcement;
- economic liability;
- portability.

Those remain outside the local harness claim.

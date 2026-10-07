# Warrant Issuer Trust Boundary v0

Status: **FROZEN BEFORE E2/E1**

Purpose: ensure the Warrant issuer cannot define its own verifier trust after issuing a Warrant.

## 1. Trust direction

The allowed direction is:

```text
operator / harness epoch setup
        |
        +--> Warrant issuer private key -> I only
        |
        +--> matching public trust store -> E1/E2/V
                                      \
                                       -> I may read to prove its key is trusted
```

The forbidden direction is:

```text
I issues Warrant
   ↓
I emits "trust me" public key
   ↓
E1/E2 accept it
```

A self-authored trust record shipped with a Warrant has no authority.

## 2. Setup ordering

For each controlled harness epoch:

1. generate one dedicated Ed25519 Warrant issuer key pair;
2. write private key only to the issuer-secret boundary;
3. write matching public trust store separately;
4. freeze/digest the trust store;
5. only then run D→I decision admission and Warrant issuance.

The trust store must exist before the Warrant body exists.

## 3. Trust-store profile

Schema:

`workflow-observatory/warrant-issuer-trust/v0`

Required top-level fields:

- `schema`
- `enforcement_domain`
- `keys`

Each v0 key entry contains:

- `issuer_key_id`
- `algorithm = Ed25519`
- `public_key_spki_der_base64`

The issuer key id remains:

`ed25519-spki-sha256:<SHA-256 exact DER SPKI bytes>`

## 4. Issuer behavior

The issuer:

- receives its private key from the secret boundary;
- reads the external trust store;
- derives its public key from the private key;
- derives `issuer_key_id`;
- requires an exact matching trusted entry;
- rejects wrong domain/algorithm/public bytes;
- does not create the trust store during issuance;
- does not return a newly invented trust anchor as authority.

The Warrant is still returned only after S0 `ISSUED` registration.

## 5. Enforcer behavior

E1/E2 must use the frozen harness trust configuration supplied independently of the Warrant request.

They must not accept:

- a trust store uploaded alongside the Warrant by C;
- a public key embedded in arbitrary producer payload;
- a self-signed key declaration;
- a replacement trust store chosen per request.

The Warrant identifies `issuer_key_id`; the verifier decides whether that id is trusted from its own configuration.

## 6. Epoch scope

The controlled trust key is ephemeral to one harness epoch.

This does not solve:

- production key rotation;
- revocation;
- HSM-backed issuer identity;
- institutional/legal identity.

Compromise of the trusted issuer private key remains total compromise of that controlled issuer epoch.

## 7. Required evidence

The witness preserves:

- exact public trust-store bytes;
- trust-store SHA-256;
- issuer key id;
- Warrant body issuer key id;
- proof those ids match;
- no private issuer key.

The private key is deleted after the controlled witness.

## 8. Attack implication

A Warrant signed by an attacker-chosen Ed25519 key, even if accompanied by a perfectly matching attacker-created trust file, must fail at E1/E2 when the frozen harness trust store does not contain that key.

This is tested as A56.

## 9. Claim boundary

This proves only that the controlled harness separates issuer identity from verifier trust configuration.

It does not prove an external organization would trust PayGod as an issuer.

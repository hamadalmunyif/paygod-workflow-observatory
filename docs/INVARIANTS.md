# Workflow Observatory v0 — Invariants

1. **Raw preservation** — when a raw external observation is available, preserve it; parsed/normalized values never replace it.
2. **No invented state** — if no recognized state-bearing event exists, state is `null` with `UNKNOWN` provenance; never default to `open`.
3. **Request binding** — an actual request is extracted only from an observed message whose `contentType` is exactly `requirement`.
4. **Descriptor ≠ instance** — offerings/resources are descriptors until a concrete workflow instance exists.
5. **Read acquisition ≠ truth** — a value returned by ACP is an observed external claim, not proof that the claim is correct.
6. **Derived ≠ raw** — JSON parsing, state derivation, normalization, counts, and projections are `LOCAL_DERIVED` unless independently sourced.
7. **Unknown stays unknown** — unavailable rationale, authority, role, action, or outcome fields remain `UNKNOWN`/`null`.
8. **No hidden authority** — this package has no signing, funding, transaction, resource-invocation, or state-mutation code paths.
9. **Acquisition separation** — this package consumes saved/stdin JSON and does not authenticate to ACP itself.
10. **External dependency boundary** — ACP CLI/SDK/backend are external; their internal behavior is not inferred from this package.
11. **Byte/semantic separation** — the raw SHA-256 binds the exact observed bytes; the normalized SHA-256 binds canonicalized local-derived JSON. They answer different questions and must not be conflated.
12. **Pack binding** — an observation pack binds one exact raw capture to one exact normalized result. Changing either changes its digest.
13. **No authenticity upgrade** — hashes prove integrity of captured bytes within the pack, not who produced them, whether the source was truthful, or whether time was authoritative.
14. **Request digest is subordinate** — a request-entry digest binds the observed request entry only; it does not prove request authorship or semantic correctness.

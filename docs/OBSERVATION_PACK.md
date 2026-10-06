# Observation Pack v0

The observatory can materialize one bounded evidence-preserving pack from a saved ACP CLI JSON response.

```bash
node bin/workflow-observatory.mjs discover --input browse.json --query research --output-dir out/discover-001
node bin/workflow-observatory.mjs inspect --input history.json --output-dir out/job-001
```

Each directory contains:

- `raw.json` — exact input bytes, unchanged.
- `normalized.json` — canonical local-derived representation.
- `manifest.json` — SHA-256 bindings and explicit trust limits.

The pack proves only internal byte/integrity binding. It does **not** prove source authenticity, truth, independent time, decision correctness, or economic authority.

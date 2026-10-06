# PayGod Workflow Observatory — Internal v0.2

Private internal research artifact. Do not upstream to `Virtual-Protocol/acp-cli` without a separate explicit decision.

This repository normalizes JSON already emitted by ACP CLI read surfaces. It does **not** import the ACP SDK, create jobs, fund jobs, sign payloads, broadcast transactions, invoke resource URLs, or mutate ACP state.

## Boundary

External dependency:

`hamadalmunyif/acp-cli` pinned baseline: `9d2be827cc19e4ea2cecfff3896398607537ea3e` (v1.0.40 / acp-node-v2 0.1.15).

The observatory is deliberately separate from the public fork. Its normalizers still consume saved/stdin JSON only. An optional GitHub Actions witness can perform a bounded authenticated marketplace read through a pinned `acp-cli` checkout, then hand the captured JSON into the same offline normalization path.

## Model

```text
Capability
  -> Request Contract
  -> Actual Request
  -> Workflow Instance
  -> Current State
  -> Available / Proposed Action
  -> Authority Boundary
  -> Outcome
```

Two object classes are kept separate:

- `workflow-descriptor`: what an external capability says can be requested.
- `workflow-instance`: what was actually requested and what has happened in one concrete run.

## Commands

Normalize a saved `acp browse ... --json` response:

```bash
node bin/workflow-observatory.mjs discover --input browse.json
```

Normalize a saved `acp job history ... --json` response:

```bash
node bin/workflow-observatory.mjs inspect --input history.json
```

This design intentionally keeps acquisition and normalization as separate boundaries. The normalizer never authenticates to ACP. The repository-native Actions witness uses a separate acquisition script, and the resulting bytes are passed into the same file/stdin normalization interface.

## Provenance

Every normalized value is tagged or inherits one of:

- `RAW_REMOTE`
- `SDK_DERIVED`
- `LOCAL_DERIVED`
- `UNKNOWN`

A derived or unknown value must never be silently promoted to raw fact.

## Observation packs

To preserve the exact external bytes alongside the normalized representation:

```bash
node bin/workflow-observatory.mjs discover --input browse.json --query research --output-dir out/discover-001
node bin/workflow-observatory.mjs inspect --input history.json --output-dir out/job-001
```

The output directory contains `raw.json`, `normalized.json`, and `manifest.json`. The manifest binds the exact raw bytes and canonical normalized JSON with SHA-256 while explicitly leaving authenticity, truth, independent time, and decision correctness as `UNKNOWN`.

## Validation

```bash
npm test
```

Current baseline: 6 invariant tests.


## Repository-native ACP -> PayGod shadow witness

The private workflow `.github/workflows/acp-paygod-shadow.yml` is an internal, manual witness. It:

1. checks out the pinned `acp-cli` source;
2. obtains a one-time human authorization URL and waits;
3. performs only `AgentApi.browse()` / `GET /agents/search`;
4. builds an Observation Pack;
5. selects an exact offering and constructs an internal **Request Candidate**;
6. checks out the pinned PayGod kernel without modifying it;
7. runs an external shadow pack through the canonical PayGod CLI;
8. uploads the evidence as a short-lived private Actions artifact.

The Request Candidate is **not submitted to ACP**. Live ACP job creation, signing, funding, resource invocation, and execution remain unauthorized.

The first run should leave `request_json` blank. That intentionally exercises the PayGod environment with a `WITHHELD_NO_PAYLOAD` request and should produce a shadow `flag`, not an execution authorization.

See `docs/REPO_NATIVE_SHADOW.md`.

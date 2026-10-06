# PayGod Workflow Observatory — Internal v0.2

Private internal research artifact. Do not upstream to `Virtual-Protocol/acp-cli` without a separate explicit decision.

This repository normalizes JSON already emitted by ACP CLI read surfaces. It does **not** import the ACP SDK, create jobs, fund jobs, sign payloads, broadcast transactions, invoke resource URLs, or mutate ACP state.

## Boundary

External dependency:

`hamadalmunyif/acp-cli` pinned baseline: `9d2be827cc19e4ea2cecfff3896398607537ea3e` (v1.0.40 / acp-node-v2 0.1.15).

The observatory is deliberately separate from the public fork. ACP acquisition remains outside this repository; this repository consumes saved/stdin JSON only.

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

This design intentionally accepts files/stdin instead of calling ACP itself. Acquisition and normalization remain separate boundaries.

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

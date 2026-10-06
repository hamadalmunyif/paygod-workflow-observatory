# Repository-native ACP -> PayGod shadow witness

Status: internal research harness.

This repository can run the full **observation-to-shadow-decision** path without modifying either external repository.

```text
GitHub Actions
    |
    +-- checkout pinned acp-cli
    |      |
    |      +-- interactive account authorization
    |      +-- signerless AgentApi.browse()
    |      +-- GET /agents/search
    |
    +-- exact raw capture
    +-- Workflow Observatory normalization
    +-- Observation Pack
    +-- exact offering selection
    +-- Request Candidate (not submitted to ACP)
    |
    +-- checkout pinned paygod-kernel-mvp
           |
           +-- build canonical PayGod CLI
           +-- run external shadow pack
           +-- emit PayGod plan/findings/ledger/manifest/receipt
```

## Critical distinction

The harness creates an **internal Request Candidate**, not a live ACP Job.

No live `create-job`, funding, signer, wallet-send, resource invocation, provider submission, completion, rejection, or trade call is present.

The first run is expected to produce one of these shadow outcomes:

- descriptor absent -> PayGod `deny`
- descriptor observed, payload absent -> PayGod `flag`
- payload present but schema not validated -> PayGod `flag`

The `allow` branch exists only as a future test vector. This harness currently never labels a live request schema as `VALIDATED`.

## Why this tests PayGod

The PayGod kernel remains pinned and unchanged. It receives an externally observed ACP workflow/request envelope through a separate pack and must produce its normal canonical artifacts. This tests whether the existing kernel can consume the external case without adding Virtuals-specific kernel semantics.

## Runtime data

Live captures and generated artifacts are uploaded as private GitHub Actions artifacts with short retention. They are not committed to Git history.

## Human action

A workflow run prints a one-time Virtuals authorization URL and waits. The human only confirms the existing account. The job then continues automatically.

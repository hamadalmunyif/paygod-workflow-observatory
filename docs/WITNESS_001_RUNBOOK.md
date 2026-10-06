# Witness 001 Runbook

This is the only approved live step for Witness 001.

## Preconditions

Use a workstation with Node.js >= 20.19.0.

Clone or checkout the external source at the frozen commit:

```bash
git clone https://github.com/hamadalmunyif/acp-cli.git
cd acp-cli
git checkout 9d2be827cc19e4ea2cecfff3896398607537ea3e
npm install
```

Authenticate ACP using the split flow. Do not create a signer for this witness.

```bash
npm run acp -- configure start --json
```

Open the returned URL, complete authentication, then:

```bash
npm run acp -- configure complete --request-id <REQUEST_ID> --json
```

## Frozen signerless browse capture

Run from the pinned `acp-cli` directory.

PowerShell:

```powershell
npx tsx -e "import('./src/lib/api/client.ts').then(async ({getClient}) => { const {agentApi}=await getClient(); const result=await agentApi.browse('research', undefined, {topK:5}); const fs=await import('node:fs'); fs.writeFileSync('../witness-001-browse.json', JSON.stringify(result)+'\n', {encoding:'utf8',flag:'wx'}); })"
```

The `wx` flag intentionally fails if the capture file already exists. Never overwrite a witness capture in place.

## Immediate inspection

Before moving the file anywhere, verify only these structural properties:

- top-level JSON object;
- a `data` array is present;
- no authentication/session fields are visible;
- no signer prompt or wallet approval occurred.

If a signer, wallet approval, job creation, funding, transaction, or other mutation is requested, stop.

## Move into the private observatory workspace

Do not commit the raw capture.

Place it under an ignored directory such as:

```text
paygod-workflow-observatory/out/witness-001/input.json
```

Then generate the pack:

```bash
node bin/workflow-observatory.mjs discover --input out/witness-001/input.json --query research --output-dir out/witness-001/pack
```

The current repository does not yet contain a separate verifier command; pack generation plus invariant tests are the current local checks. A dedicated verifier is a later hardening step.

## Witness closure record

Record only:

- external commit SHA;
- query string;
- capture byte length;
- capture SHA-256;
- normalized canonical SHA-256;
- descriptor count;
- whether any unexpected authority prompt occurred.

Do not record authentication material.

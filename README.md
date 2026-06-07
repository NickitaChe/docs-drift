# docs-drift

`docs-drift` catches stale commands, flags, environment variables, and config keys in Markdown documentation before they merge.

## What it checks today

`docs-drift` is intentionally narrow in `v0.1.0`. It compares Markdown docs against explicit sources of truth and produces deterministic output for local runs and CI.

## Why someone would adopt it

- zero API keys
- zero hosted dependency
- deterministic output you can trust in CI
- immediate value for repos with `README` command docs, `.env.example`, and config schemas

## Why this exists

Maintainers routinely update code without updating `README.md`, `/docs`, `.env.example`, or config references. `docs-drift` scans repository docs and compares them against explicit sources of truth so CI can flag drift early.

## MVP checks

- `cli_flags`: compare documented commands and flags against a configured CLI help command
- `env_vars`: compare documented environment variables against `.env.example`
- `config_keys`: compare documented config keys against JSON Schema or JSON/YAML example files

## Quickstart

Install dependencies and build:

```bash
npm install
npm run build
```

No API key is required. The current version runs entirely on local repository files and CLI help output.

Run the full verification suite:

```bash
npm run check
```

Run from the workspace root without wiring paths by hand:

```bash
npm run scan
```

Run scan:

```bash
npm run scan
```

Machine-readable output:

```bash
npm run docs-drift -- scan --config docs-drift.yml --format json
```

Example clean output:

```text
Checked 2 Markdown file(s)
Found 0 issue(s)
No documentation drift detected.
```

Help and version:

```bash
npm run docs-drift -- --help
npm run docs-drift -- --version
```

## Example config

```yaml
docs:
  include:
    - README.md
    - docs/**/*.md

sources:
  cli:
    command: "npm run cli -- --help"
  env:
    file: ".env.example"
  configSchema:
    file: "config.schema.json"

checks:
  - cli_flags
  - env_vars
  - config_keys

ignore:
  cliFlags: []
  envVars: []
  configKeys: []

report:
  format: text
  failOn:
    - missing_in_source
    - parse_error
```

## GitHub Action

```yaml
- uses: ./packages/github-action
  with:
    config: docs-drift.yml
    format: text
    fail-on: missing_in_source,parse_error
```

The action writes a Markdown summary to the workflow job summary and fails when configured issue kinds are present.

For local development in this monorepo, `npm run docs-drift -- --help` and `npm run scan` are the supported entrypoints.

## Adjacent Apps

This repository now also contains two repo-ready scaffolds that are intended to be split out over time:

- `operator-console/`: a local operator app for scanning repos, reviewing findings, and creating issues/PRs
- `proof-site/`: a static snapshot-driven site for public rollout results and validated examples

There is also a concrete external PR package example in:

- [operator-console/examples/ffmpeg-progressbar-cli-pr-package.json](operator-console/examples/ffmpeg-progressbar-cli-pr-package.json)
- [operator-console/examples/ffmpeg-progressbar-cli-pr.md](operator-console/examples/ffmpeg-progressbar-cli-pr.md)

These are intentionally outside the `docs-drift` workspaces so the scanner stays focused on drift detection.

## Try it on another repo

1. Clone a target repository locally.
2. Copy [docs/templates/external-repo.docs-drift.yml](docs/templates/external-repo.docs-drift.yml) into that repository as `docs-drift.yml`.
3. Adjust the `sources` block for that project's CLI/env/schema.
4. Run:

```bash
npm exec --prefix ../docs-drift -- docs-drift scan --config docs-drift.yml
```

Replace `../docs-drift` with the path to your local `docs-drift` clone if it lives elsewhere.

If the report shows a real mismatch, open an issue or PR with the exact finding.

Supporting docs for external rollout:

- [OSS rollout playbook](docs/oss-rollout.md)
- [Outreach templates](docs/outreach-templates.md)
- [First target repositories](docs/first-targets.md)
- [First external run](docs/first-external-run.md)
- [Publish checklist](docs/publish-checklist.md)
- [First push sequence](docs/first-push.md)

## Early Rollout

Initial external checks are already useful for calibration:

- `benawad/gen-env-types`: clean pass for `cli_flags`
- `sidneys/ffmpeg-progressbar-cli`: validated README/source mismatch around env var naming

Concrete validated mismatch from `sidneys/ffmpeg-progressbar-cli`:

- README documents `BAR_BEAM_RATIO`
- README example uses `BAR_BAR_SIZE_RATIO`
- source code reads `process.env.BAR_SIZE_RATIO`

This is exactly the kind of drift `docs-drift` is meant to surface and turn into a small docs-only fix.

## Release readiness

Before publishing a release candidate:

```bash
npm run release:check
```

This runs build, tests, and dry-run package verification for the publishable workspaces.

Before the first public GitHub push:

- create the real GitHub repository
- add the final repository URLs to the root and package manifests if you plan to publish to npm
- tag the first release candidate

## Local quality bar

- `npm run build` succeeds
- `npm test` passes on Node 20
- `npm run scan` runs cleanly in this repository
- the GitHub Action wrapper emits a summary and respects `fail-on`

## Roadmap

- More schema types and richer config extraction
- OpenAPI and runnable example support
- Inline PR comment support

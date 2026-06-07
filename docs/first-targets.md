# First Target Profiles

The best first targets are not necessarily the most famous repositories. They are the ones where `docs-drift` can find a small, verifiable mismatch with minimal ambiguity.

## Profile 1: Narrow CLI repo

Look for:

- one binary
- `README.md` command examples
- clear `--help` output
- active maintainers

Best first check:

- documented flags versus current CLI help

Best likely contribution:

- one small docs-only PR fixing a stale flag or example

## Profile 2: App repo with `.env.example`

Look for:

- documented setup steps
- `.env.example`
- active user-facing installation docs

Best first check:

- env vars mentioned in `README.md` or `/docs` but missing from `.env.example`

Best likely contribution:

- docs cleanup or missing variable template update

## Profile 3: Schema-driven repo

Look for:

- `config.schema.json`, OpenAPI schema, or strongly documented nested config
- configuration reference in docs
- small surface area for manual verification

Best first check:

- documented config keys that no longer exist in the schema

Best likely contribution:

- one precise docs fix with a schema reference

## Selection rule

Choose targets where:

- the source of truth is explicit
- the docs are hand-maintained
- a small mismatch would be valuable to users
- you can verify the finding manually in under 10 minutes

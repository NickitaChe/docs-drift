# Outreach Templates

Use these as short, technical, low-friction messages when `docs-drift` finds something real in another repository.

## What to say about yourself

Good:

`I’m testing a small OSS docs-drift checker against active open-source repos and found a concrete mismatch here.`

Bad:

- long personal introduction
- asking for stars in the first message
- asking maintainers to promote your tool

## Issue template

Title:

`docs: README references a flag that is not present in current CLI help`

Body:

```md
I was checking the repo docs against the current CLI help output and found one mismatch.

The README still documents `--legacy-mode`, but the current help output does not list that flag.

If that flag was intentionally removed, the docs likely need an update. If useful, I can open a PR with the doc fix.
```

## PR template

Title:

`docs: remove stale CLI flag from README`

Body:

```md
This updates the README to match the current CLI help output.

While checking the docs against the current command help, I found that `--legacy-mode` is documented but no longer present in the shipped CLI output.

This PR removes the stale reference so new users do not copy an outdated flag.
```

## Env var issue template

Title:

`docs: documented env var is missing from .env.example`

Body:

```md
I noticed the docs mention `OLD_SECRET`, but `.env.example` does not include it.

If the variable is still supported, it may need to be restored to the template. If it was removed, the docs likely need to be updated.
```

## Config key PR template

Title:

`docs: remove outdated config key from docs`

Body:

```md
This updates the docs to match the current config schema.

The docs still mention `server.legacyMode`, but that key is not present in the current schema/example configuration.
```

## What not to add

- requests to star your repository
- grant or sponsorship asks
- marketing copy
- claims about automation unless you verified the mismatch manually

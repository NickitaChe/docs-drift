# OSS Rollout Playbook

## 1. Prepare the repo

- replace placeholder GitHub URLs in `package.json`
- publish the repository publicly
- add a first tagged release, even if it is `v0.1.0-alpha.1`
- keep `npm run check` and `npm run release:check` green

## 2. Find candidate repositories

Good early targets for `docs-drift`:

- CLI projects with long `README` command sections
- apps that keep `.env.example`
- repos with `config.schema.json`, `openapi.yaml`, or documented nested config keys
- active maintainers who merge documentation fixes quickly

## 3. What to look for

- a documented flag that no longer appears in CLI help
- a documented env var missing from `.env.example`
- a documented config key that no longer exists in the schema
- examples that reference old command names

## 4. First outreach pattern

Start with an issue when:

- the mismatch is real but you do not yet have a patch
- the project has contribution rules that ask for prior discussion

Start with a PR when:

- the mismatch is obvious
- the fix is small and directly verifiable
- the repo regularly accepts drive-by documentation fixes

## 5. Example issue

Title:

`docs: README references flag that is not present in current CLI help`

Body:

`I noticed the README still documents \`--legacy-mode\`, but the current CLI help output does not list that flag. I verified this against the current help text and can open a PR if you want the docs updated.`

## 6. Example PR

Title:

`docs: remove stale CLI flag from README`

Body:

`This updates the README to match the current CLI help output. The documented flag was no longer present in the shipped command help, so the docs were misleading for new users.`

## 7. How `docs-drift` helps

For each candidate repo:

1. add a temporary `docs-drift.yml`
2. point it at the repo's README/docs and explicit sources of truth
3. run the scan locally
4. capture the report
5. open an issue or PR with the concrete mismatch

Use `docs/templates/external-repo.docs-drift.yml` as the starting template.

# First External Run

This is the safest way to start creating useful external issues and PRs with `docs-drift`.

## 1. Pick the right target

Choose a repository that has at least two of these:

- a long `README.md` with command examples
- a `.env.example`
- a config schema or documented nested config keys
- active maintainers and recent merges

Avoid for the very first run:

- huge narrative READMEs with lots of prose and generated docs
- repos whose published CLI is known to be packaging-fragile
- repos where the source of truth is unclear

## 2. Clone the target

```bash
git clone <repo-url>
cd <repo-dir>
```

## 3. Copy the starter config

Start from:

[docs/templates/external-repo.docs-drift.yml](templates/external-repo.docs-drift.yml)

Then trim it to only the checks the target repo can actually support.

Examples:

- CLI-only repo: keep only `cli_flags`
- app with `.env.example` but no CLI: keep only `env_vars`
- schema-driven repo: keep only `config_keys`

## 4. Point the config at real sources of truth

Examples:

```yaml
sources:
  cli:
    command: "your-cli --help"
```

```yaml
sources:
  env:
    file: ".env.example"
```

```yaml
sources:
  configSchema:
    file: "config.schema.json"
```

## 5. Run `docs-drift`

```bash
npm exec --prefix ../docs-drift -- docs-drift scan --config docs-drift.yml
```

Replace `../docs-drift` with the path to your local `docs-drift` clone if it lives elsewhere.

## 6. Manually verify every finding

Only proceed if the mismatch is obviously real.

Checklist:

- the documented flag or key exists in the docs you targeted
- the source-of-truth file or CLI help genuinely disagrees
- the mismatch is not just formatting, aliasing, or generated text noise

## 7. Choose issue vs PR

Open an issue when:

- the fix is not obvious
- the repo wants discussion first
- the mismatch may be intentional

Open a PR when:

- the fix is small
- the docs change is straightforward
- you can explain exactly what source of truth you compared against

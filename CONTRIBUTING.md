# Contributing

## Development

```bash
npm install
npm run build
npm test
```

## Project layout

- `packages/core`: parsing, extraction, diffing, reporting
- `packages/cli`: command-line interface
- `packages/github-action`: GitHub Action wrapper
- `tests`: unit and integration tests

## Contribution expectations

- Keep checks explicit and low-noise
- Add tests for new extractors and issue kinds
- Prefer configuration over guessing

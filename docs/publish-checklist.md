# Publish Checklist

## Minimum before public GitHub push

- `npm run release:check`
- replace placeholder URLs in issue template config and any package metadata you choose to publish
- confirm `README.md` reflects current commands and scope
- confirm `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, and `CONTRIBUTING.md` are present

## Minimum before npm publish

- set real `repository`, `homepage`, and `bugs` URLs in published package manifests
- confirm package names are final
- run `npm pack --dry-run --workspace docs-drift`
- review tarball contents
- create a Git tag that matches the version

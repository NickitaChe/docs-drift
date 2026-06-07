# First Push Sequence

Use this once you create the real GitHub repository.

## 1. Create the repository on GitHub

Suggested name:

`docs-drift`

Suggested visibility:

`public`

## 2. Connect the remote

```bash
git remote add origin https://github.com/<your-user-or-org>/docs-drift.git
```

## 3. Create the first branch

```bash
git checkout -b main
```

## 4. Stage and verify

```bash
git add .
npm run release:check
```

## 5. First commit

```bash
git commit -m "Initial public release of docs-drift"
```

## 6. Push

```bash
git push -u origin main
```

## 7. First tag

Start conservative:

```bash
git tag v0.1.0
git push origin v0.1.0
```

If you want a softer launch:

```bash
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

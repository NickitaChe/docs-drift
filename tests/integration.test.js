import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { afterEach } from "node:test";
import { promisify } from "node:util";
import {
  SCAN_REPORT_SCHEMA_VERSION,
  loadConfig,
  scanRepository,
  shouldFail
} from "../packages/core/dist/index.js";

const tempDirs = [];
const execFile = promisify(execFileCallback);

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

test("scanRepository finds stale env vars and config keys", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docs-drift-"));
  tempDirs.push(fixtureRoot);

  await fs.writeFile(
    path.join(fixtureRoot, "README.md"),
    [
      "# Example",
      "",
      "Set `DATABASE_URL` and `OLD_SECRET` before running.",
      "Config supports `server.port` and `server.legacyMode`."
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(path.join(fixtureRoot, ".env.example"), "DATABASE_URL=postgres://demo\n", "utf8");
  await fs.mkdir(path.join(fixtureRoot, "fixtures"), { recursive: true });
  await fs.writeFile(
    path.join(fixtureRoot, "fixtures", "config.schema.json"),
    JSON.stringify({
      type: "object",
      properties: {
        server: {
          type: "object",
          properties: {
            port: { type: "number" }
          }
        }
      }
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(fixtureRoot, "docs-drift.yml"),
    [
      "docs:",
      "  include:",
      "    - README.md",
      "sources:",
      "  env:",
      "    file: .env.example",
      "  configSchema:",
      "    file: fixtures/config.schema.json",
      "checks:",
      "  - env_vars",
      "  - config_keys",
      "report:",
      "  failOn:",
      "    - missing_in_source"
    ].join("\n"),
    "utf8"
  );

  const config = await loadConfig(path.join(fixtureRoot, "docs-drift.yml"));
  const report = await scanRepository(fixtureRoot, config);

  assert.ok(report.issues.map((issue) => issue.value).includes("OLD_SECRET"));
  assert.ok(report.issues.map((issue) => issue.value).includes("server.legacyMode"));
  assert.equal(shouldFail(report, ["missing_in_source"]), true);
});

test("scanRepository reports parse_error instead of throwing when source file is missing", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docs-drift-"));
  tempDirs.push(fixtureRoot);

  await fs.writeFile(path.join(fixtureRoot, "README.md"), "Use `DATABASE_URL`.", "utf8");
  await fs.writeFile(
    path.join(fixtureRoot, "docs-drift.yml"),
    [
      "docs:",
      "  include:",
      "    - README.md",
      "sources:",
      "  env:",
      "    file: .env.example",
      "checks:",
      "  - env_vars",
      "report:",
      "  failOn:",
      "    - parse_error"
    ].join("\n"),
    "utf8"
  );

  const config = await loadConfig(path.join(fixtureRoot, "docs-drift.yml"));
  const report = await scanRepository(fixtureRoot, config);

  assert.equal(report.issues.some((issue) => issue.kind === "parse_error"), true);
  assert.equal(shouldFail(report, ["parse_error"]), true);
});

test("scanRepository detects stale CLI flags from help output", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docs-drift-"));
  tempDirs.push(fixtureRoot);

  await fs.writeFile(
    path.join(fixtureRoot, "README.md"),
    [
      "# Example CLI",
      "",
      "Run `tool serve --watch --legacy-mode` during development."
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(fixtureRoot, "docs-drift.yml"),
    [
      "docs:",
      "  include:",
      "    - README.md",
      "sources:",
      "  cli:",
      "    command: node -e \"console.log('tool serve    Start the server'); console.log('  --watch  Watch mode');\"",
      "checks:",
      "  - cli_flags",
      "report:",
      "  failOn:",
      "    - missing_in_source"
    ].join("\n"),
    "utf8"
  );

  const config = await loadConfig(path.join(fixtureRoot, "docs-drift.yml"));
  const report = await scanRepository(fixtureRoot, config);

  assert.ok(report.issues.map((issue) => issue.value).includes("--legacy-mode"));
});

test("CLI honors INIT_CWD for workspace execution", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docs-drift-cli-"));
  tempDirs.push(fixtureRoot);

  await fs.writeFile(path.join(fixtureRoot, "README.md"), "Set `DATABASE_URL`.", "utf8");
  await fs.writeFile(path.join(fixtureRoot, ".env.example"), "DATABASE_URL=postgres://demo\n", "utf8");
  await fs.writeFile(
    path.join(fixtureRoot, "docs-drift.yml"),
    [
      "docs:",
      "  include:",
      "    - README.md",
      "sources:",
      "  env:",
      "    file: .env.example",
      "checks:",
      "  - env_vars",
      "report:",
      "  failOn:",
      "    - missing_in_source"
    ].join("\n"),
    "utf8"
  );

  const { stdout } = await execFile(
    process.execPath,
    [path.join(process.cwd(), "packages", "cli", "dist", "index.js"), "scan", "--config", "docs-drift.yml"],
    {
      cwd: path.join(process.cwd(), "packages", "cli"),
      env: {
        ...process.env,
        INIT_CWD: fixtureRoot
      }
    }
  );

  assert.match(stdout, /No documentation drift detected\./);
});

test("scanRepository parses CLI help even when the command exits non-zero", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docs-drift-cli-nonzero-"));
  tempDirs.push(fixtureRoot);

  await fs.writeFile(
    path.join(fixtureRoot, "README.md"),
    [
      "# Example CLI",
      "",
      "```bash",
      "tool --help",
      "```",
      "",
      "Supported flags: `--help`, `--watch`"
    ].join("\n"),
    "utf8"
  );

  const report = await scanRepository(fixtureRoot, {
    docs: { include: ["README.md"] },
    sources: {
      cli: {
        command:
          "node -e \"console.log('tool path/to/file'); console.log('  --help  Show help'); process.exit(1);\""
      }
    },
    checks: ["cli_flags"],
    report: { failOn: ["missing_in_source"] }
  });

  assert.equal(report.issues.some((issue) => issue.kind === "parse_error"), false);
  assert.equal(report.issues.some((issue) => issue.value === "--help"), false);
  assert.equal(report.issues.some((issue) => issue.value === "--watch"), true);
});

test("scanRepository emits a stable machine-readable report contract", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docs-drift-json-"));
  tempDirs.push(fixtureRoot);

  await fs.writeFile(path.join(fixtureRoot, "README.md"), "Set `DATABASE_URL` and `OLD_SECRET`.", "utf8");
  await fs.writeFile(path.join(fixtureRoot, ".env.example"), "DATABASE_URL=postgres://demo\n", "utf8");

  const report = await scanRepository(fixtureRoot, {
    docs: { include: ["README.md"] },
    sources: { env: { file: ".env.example" } },
    checks: ["env_vars"],
    report: { format: "json", failOn: ["missing_in_source"] }
  });

  assert.equal(report.schemaVersion, SCAN_REPORT_SCHEMA_VERSION);
  assert.equal(report.repositoryRoot, fixtureRoot);
  assert.deepEqual(report.checkedFiles, ["README.md"]);
  assert.equal(Array.isArray(report.issues), true);
  assert.deepEqual(report.summary.byKind, {
    missing_in_source: 1,
    missing_in_docs: 0,
    parse_error: 0
  });
  assert.deepEqual(report.issues[0], {
    check: "env_vars",
    kind: "missing_in_source",
    entityType: "env_var",
    value: "OLD_SECRET",
    normalized: "OLD_SECRET",
    files: ["README.md"],
    message: "Documented environment variable was not found in source file."
  });
});

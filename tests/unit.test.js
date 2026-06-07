import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  formatTextReport,
  parseCliArguments,
  scanRepository,
  shouldFail
} from "../packages/core/dist/index.js";

test("parseCliArguments parses config, format, and fail-on", () => {
  const parsed = parseCliArguments([
    "scan",
    "--config",
    "custom.yml",
    "--format",
    "json",
    "--fail-on",
    "missing_in_source,parse_error"
  ]);

  assert.deepEqual(parsed, {
    command: "scan",
    configPath: "custom.yml",
    format: "json",
    failOn: ["missing_in_source", "parse_error"],
    help: false,
    version: false
  });
});

test("parseCliArguments supports help without a command", () => {
  const parsed = parseCliArguments(["--help"]);

  assert.deepEqual(parsed, {
    command: "",
    configPath: "docs-drift.yml",
    format: undefined,
    failOn: undefined,
    help: true,
    version: false
  });
});

test("reporting formats an empty report", () => {
  const report = {
    checkedFiles: ["README.md"],
    issues: [],
    summary: {
      issueCount: 0,
      byKind: {
        missing_in_source: 0,
        missing_in_docs: 0,
        parse_error: 0
      }
    }
  };

  assert.match(formatTextReport(report), /No documentation drift detected\./);
  assert.equal(shouldFail(report, ["missing_in_source"]), false);
});

test("markdown extraction ignores uppercase prose and filenames", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docs-drift-unit-"));
  try {
    await fs.writeFile(
      path.join(fixtureRoot, "README.md"),
      [
        "# docs-drift",
        "",
        "The CLI reads `DATABASE_URL`.",
        "See `README.md` and `docs-drift.yml` for setup.",
        "JSON and YAML are supported.",
        "Version `v0.1.0` is current."
      ].join("\n"),
      "utf8"
    );
    await fs.writeFile(path.join(fixtureRoot, ".env.example"), "DATABASE_URL=postgres://demo\n", "utf8");

    const report = await scanRepository(fixtureRoot, {
      docs: { include: ["README.md"] },
      sources: { env: { file: ".env.example" } },
      checks: ["env_vars"],
      report: { failOn: ["missing_in_source"] }
    });

    assert.deepEqual(report.issues, []);
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("scanRepository rejects invalid config shape", async () => {
  await assert.rejects(
    () =>
      scanRepository(process.cwd(), {
        docs: { include: [] },
        sources: {},
        checks: [],
        report: { failOn: ["missing_in_source"] }
      }),
    /docs\.include must be a non-empty array|checks must be a non-empty array/
  );
});

test("scanRepository does not treat prose sentences as commands", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docs-drift-prose-"));
  try {
    await fs.writeFile(
      path.join(fixtureRoot, "README.md"),
      [
        "# Example",
        "",
        "This command writes output to a file.",
        "",
        "```bash",
        "tool run --json",
        "```"
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
        "    command: node -e \"console.log('tool run    Run the tool'); console.log('  --json  JSON output');\"",
        "checks:",
        "  - cli_flags",
        "report:",
        "  failOn:",
        "    - missing_in_source"
      ].join("\n"),
      "utf8"
    );

    const config = await scanRepository(fixtureRoot, {
      docs: { include: ["README.md"] },
      sources: { cli: { command: "node -e \"console.log('tool run    Run the tool'); console.log('  --json  JSON output');\"" } },
      checks: ["cli_flags"],
      report: { failOn: ["missing_in_source"] }
    });

    assert.equal(config.issues.some((issue) => issue.value === "This command writes output to a file"), false);
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("scanRepository does not treat help descriptions and code samples as CLI commands", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docs-drift-help-"));
  try {
    await fs.writeFile(
      path.join(fixtureRoot, "README.md"),
      [
        "# Example",
        "",
        "```",
        "  -o, --types-output          Output name/path for types file | defaults to `env.d.ts`",
        "  -e, --example-env-path      Path to save .env.example file",
        "declare namespace NodeJS {",
        "```",
        "",
        "```bash",
        "npx gen-env-types .env -o src/types/env.d.ts -e .",
        "```"
      ].join("\n"),
      "utf8"
    );

    const report = await scanRepository(fixtureRoot, {
      docs: { include: ["README.md"] },
      sources: {
        cli: {
          command: "node -e \"console.log('gen-env-types path/to/.env'); console.log('  -o, --types-output  Output'); console.log('  -e, --example-env-path  Output');\""
        }
      },
      checks: ["cli_flags"],
      report: { failOn: ["missing_in_source"] }
    });

    const issueValues = new Set(report.issues.map((issue) => issue.value));
    assert.equal(issueValues.has("declare namespace NodeJS"), false);
    assert.equal(issueValues.has("defaults to"), false);
    assert.equal(issueValues.has("Path to save"), false);
    assert.equal(issueValues.has("npx gen-env-types"), false);
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

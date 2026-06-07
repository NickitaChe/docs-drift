#!/usr/bin/env node
import process from "node:process";
import {
  formatTextReport,
  loadConfig,
  parseCliArguments,
  scanRepository,
  shouldFail
} from "@docs-drift/core";

const VERSION = "0.1.0";
const USAGE = [
  "Usage: docs-drift scan [--config docs-drift.yml] [--format text|json] [--fail-on kinds]",
  "",
  "Options:",
  "  --config <path>         Path to docs-drift YAML config",
  "  --format <text|json>    Output format",
  "  --fail-on <kinds>       Comma-separated issue kinds",
  "  --help, -h              Show help",
  "  --version, -v           Show version"
].join("\n");

async function main(): Promise<void> {
  const parsed = parseCliArguments(process.argv.slice(2));
  const repositoryRoot = process.env.INIT_CWD ?? process.cwd();
  if (parsed.version) {
    process.stdout.write(`${VERSION}\n`);
    process.exit(0);
  }
  if (parsed.help || !parsed.command) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  if (parsed.command !== "scan") {
    process.stderr.write(`${USAGE}\n`);
    process.exit(1);
  }

  const config = await loadConfig(parsed.configPath);
  const report = await scanRepository(repositoryRoot, config);
  const format = parsed.format ?? config.report?.format ?? "text";
  const failOn = parsed.failOn ?? config.report?.failOn ?? ["missing_in_source"];

  if (format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatTextReport(report)}\n`);
  }

  process.exit(shouldFail(report, failOn) ? 1 : 0);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`docs-drift failed: ${message}\n`);
  process.exit(1);
});

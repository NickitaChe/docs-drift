import { appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  formatTextReport,
  formatMarkdownSummary,
  loadConfig,
  scanRepository,
  shouldFail,
  type IssueKind,
  type ReportFormat
} from "@docs-drift/core";

async function main(): Promise<void> {
  const configPath = process.env.INPUT_CONFIG ?? "docs-drift.yml";
  const format = ((process.env.INPUT_FORMAT ?? "text").trim() || "text") as ReportFormat;
  const failOn = (process.env.INPUT_FAIL_ON ?? "missing_in_source,parse_error")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean) as IssueKind[];

  const config = await loadConfig(path.resolve(process.cwd(), configPath));
  const report = await scanRepository(process.cwd(), config);
  const summary = formatMarkdownSummary(report);

  if (format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatTextReport(report)}\n`);
  }
  process.stdout.write(`${summary}\n`);
  for (const issue of report.issues) {
    process.stdout.write(`::warning title=docs-drift::${issue.message} (${issue.value})\n`);
  }
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile && existsSync(path.dirname(summaryFile))) {
    appendFileSync(summaryFile, `${summary}\n`, "utf8");
  }

  if (shouldFail(report, failOn)) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`docs-drift action failed: ${message}\n`);
  process.exit(1);
});

import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const DOUBLE_STAR_SENTINEL = "__DOCS_DRIFT_DOUBLE_STAR__";
export const SCAN_REPORT_SCHEMA_VERSION = "docs-drift.report.v1";

export type CheckName = "cli_flags" | "env_vars" | "config_keys";
export type IssueKind = "missing_in_source" | "missing_in_docs" | "parse_error";
export type EntityType = "command" | "flag" | "env_var" | "config_key";
export type ReportFormat = "text" | "json";

export interface ScanConfig {
  docs: {
    include: string[];
    exclude?: string[];
  };
  sources: {
    cli?: { command: string };
    env?: { file: string };
    configSchema?: { file: string };
  };
  checks: CheckName[];
  ignore?: {
    cliFlags?: string[];
    envVars?: string[];
    configKeys?: string[];
  };
  report?: {
    format?: ReportFormat;
    failOn?: IssueKind[];
  };
}

interface ValidatedScanConfig {
  docs: {
    include: string[];
    exclude: string[];
  };
  sources: {
    cli?: { command: string };
    env?: { file: string };
    configSchema?: { file: string };
  };
  checks: CheckName[];
  ignore: {
    cliFlags: string[];
    envVars: string[];
    configKeys: string[];
  };
  report: {
    format: ReportFormat;
    failOn: IssueKind[];
  };
}

export interface EntityRecord {
  value: string;
  normalized: string;
  files: string[];
}

export interface DocumentFacts {
  commands: EntityRecord[];
  flags: EntityRecord[];
  envVars: EntityRecord[];
  configKeys: EntityRecord[];
}

export interface SourceFacts {
  commands: string[];
  flags: string[];
  envVars: string[];
  configKeys: string[];
}

export interface DriftIssue {
  check: CheckName;
  kind: IssueKind;
  entityType: EntityType;
  value: string;
  normalized: string;
  files: string[];
  message: string;
}

export interface ScanReport {
  schemaVersion: string;
  repositoryRoot: string;
  checkedFiles: string[];
  issues: DriftIssue[];
  summary: {
    issueCount: number;
    byKind: Record<IssueKind, number>;
  };
}

export async function loadConfig(configPath: string): Promise<ScanConfig> {
  const baseDirectory = process.env.INIT_CWD ?? process.cwd();
  const absolutePath = path.resolve(baseDirectory, configPath);
  const raw = await fs.readFile(absolutePath, "utf8");
  return parseSimpleYaml(raw) as ScanConfig;
}

export async function scanRepository(repositoryRoot: string, config: ScanConfig): Promise<ScanReport> {
  const validatedConfig = validateConfig(config);
  const checkedFiles = await resolveDocFiles(
    repositoryRoot,
    validatedConfig.docs.include,
    validatedConfig.docs.exclude
  );
  const docs = await collectDocumentFacts(repositoryRoot, checkedFiles);
  const { facts: sources, issues: sourceIssues } = await collectSourceFacts(repositoryRoot, validatedConfig);
  const issues = [...sourceIssues, ...diffFacts(docs, sources, validatedConfig)];

  return {
    schemaVersion: SCAN_REPORT_SCHEMA_VERSION,
    repositoryRoot,
    checkedFiles,
    issues,
    summary: {
      issueCount: issues.length,
      byKind: {
        missing_in_source: issues.filter((issue) => issue.kind === "missing_in_source").length,
        missing_in_docs: issues.filter((issue) => issue.kind === "missing_in_docs").length,
        parse_error: issues.filter((issue) => issue.kind === "parse_error").length
      }
    }
  };
}

export function shouldFail(report: ScanReport, failOn: IssueKind[]): boolean {
  const failKinds = new Set(failOn);
  return report.issues.some((issue) => failKinds.has(issue.kind));
}

export function formatTextReport(report: ScanReport): string {
  const lines = [
    `Checked ${report.checkedFiles.length} Markdown file(s)`,
    `Found ${report.summary.issueCount} issue(s)`
  ];

  if (report.issues.length === 0) {
    lines.push("No documentation drift detected.");
    return lines.join("\n");
  }

  for (const issue of report.issues) {
    const fileText = issue.files.length > 0 ? ` [${issue.files.join(", ")}]` : "";
    lines.push(`- [${issue.kind}] ${issue.entityType} ${issue.value}: ${issue.message}${fileText}`);
  }

  return lines.join("\n");
}

export function formatMarkdownSummary(report: ScanReport): string {
  const lines = [
    "## docs-drift",
    "",
    `- Checked files: ${report.checkedFiles.length}`,
    `- Issues: ${report.summary.issueCount}`,
    ""
  ];

  if (report.issues.length === 0) {
    lines.push("No documentation drift detected.");
    return lines.join("\n");
  }

  lines.push("| Kind | Entity | Value | Files |");
  lines.push("| --- | --- | --- | --- |");
  for (const issue of report.issues) {
    lines.push(`| ${issue.kind} | ${issue.entityType} | \`${issue.value}\` | ${issue.files.join(", ")} |`);
  }

  return lines.join("\n");
}

export function parseCliArguments(args: string[]): {
  command: string;
  configPath: string;
  format?: ReportFormat;
  failOn?: IssueKind[];
  help: boolean;
  version: boolean;
} {
  const [first = ""] = args;
  const command = first.startsWith("-") ? "" : first;
  let configPath = "docs-drift.yml";
  let format: ReportFormat | undefined;
  let failOn: IssueKind[] | undefined;
  let help = false;
  let version = false;

  for (let index = command ? 1 : 0; index < args.length; index += 1) {
    const current = args[index];
    const next = args[index + 1];

    if (current === "--help" || current === "-h") {
      help = true;
    } else if (current === "--version" || current === "-v") {
      version = true;
    } else if (current === "--config" && next) {
      configPath = next;
      index += 1;
    } else if (current === "--format" && next && (next === "text" || next === "json")) {
      format = next;
      index += 1;
    } else if (current === "--fail-on" && next) {
      failOn = next.split(",").map((item) => item.trim()).filter(Boolean) as IssueKind[];
      index += 1;
    }
  }

  return { command, configPath, format, failOn, help, version };
}

async function collectDocumentFacts(repositoryRoot: string, files: string[]): Promise<DocumentFacts> {
  const commandMap = new Map<string, EntityRecord>();
  const flagMap = new Map<string, EntityRecord>();
  const envMap = new Map<string, EntityRecord>();
  const configMap = new Map<string, EntityRecord>();

  for (const relativeFile of files) {
    const absoluteFile = path.join(repositoryRoot, relativeFile);
    const content = await fs.readFile(absoluteFile, "utf8");
    const parsed = extractMarkdownFacts(content);
    mergeRecords(commandMap, parsed.commands, relativeFile, normalizeCommand);
    mergeRecords(flagMap, parsed.flags, relativeFile, normalizeFlag);
    mergeRecords(envMap, parsed.envVars, relativeFile, normalizeExact);
    mergeRecords(configMap, parsed.configKeys, relativeFile, normalizeConfigKey);
  }

  return {
    commands: [...commandMap.values()],
    flags: [...flagMap.values()],
    envVars: [...envMap.values()],
    configKeys: [...configMap.values()]
  };
}

async function collectSourceFacts(
  repositoryRoot: string,
  config: ValidatedScanConfig
): Promise<{ facts: SourceFacts; issues: DriftIssue[] }> {
  const commands = new Set<string>();
  const flags = new Set<string>();
  const envVars = new Set<string>();
  const configKeys = new Set<string>();
  const issues: DriftIssue[] = [];

  if (config.checks.includes("cli_flags") && config.sources.cli?.command) {
    try {
      const cliFacts = await extractCliFacts(repositoryRoot, config.sources.cli.command);
      cliFacts.commands.forEach((value) => commands.add(value));
      cliFacts.flags.forEach((value) => flags.add(value));
    } catch (error: unknown) {
      issues.push(makeParseError("cli_flags", config.sources.cli.command, "CLI source could not be executed.", error));
    }
  }

  if (config.checks.includes("env_vars") && config.sources.env?.file) {
    try {
      const envFile = path.join(repositoryRoot, config.sources.env.file);
      (await extractEnvVars(envFile)).forEach((value) => envVars.add(value));
    } catch (error: unknown) {
      issues.push(makeParseError("env_vars", config.sources.env.file, "Environment variable source file could not be read.", error));
    }
  }

  if (config.checks.includes("config_keys") && config.sources.configSchema?.file) {
    try {
      const schemaFile = path.join(repositoryRoot, config.sources.configSchema.file);
      (await extractConfigKeys(schemaFile)).forEach((value) => configKeys.add(value));
    } catch (error: unknown) {
      issues.push(makeParseError("config_keys", config.sources.configSchema.file, "Config schema source file could not be parsed.", error));
    }
  }

  return {
    facts: {
      commands: [...commands],
      flags: [...flags],
      envVars: [...envVars],
      configKeys: [...configKeys]
    },
    issues
  };
}

function diffFacts(docs: DocumentFacts, sources: SourceFacts, config: ValidatedScanConfig): DriftIssue[] {
  const issues: DriftIssue[] = [];
  const ignoreFlags = new Set(config.ignore.cliFlags.map(normalizeFlag));
  const ignoreEnvVars = new Set(config.ignore.envVars.map(normalizeExact));
  const ignoreConfigKeys = new Set(config.ignore.configKeys.map(normalizeConfigKey));

  if (config.checks.includes("cli_flags")) {
    const sourceCommands = new Set(sources.commands.map(normalizeCommand));
    const sourceFlags = new Set(sources.flags.map(normalizeFlag));

    for (const item of docs.commands) {
      if (!sourceCommands.has(item.normalized)) {
        issues.push(
          makeIssue("cli_flags", "missing_in_source", "command", item, "Documented command was not found in CLI help output.")
        );
      }
    }

    for (const item of docs.flags) {
      if (ignoreFlags.has(item.normalized)) {
        continue;
      }
      if (!sourceFlags.has(item.normalized)) {
        issues.push(
          makeIssue("cli_flags", "missing_in_source", "flag", item, "Documented flag was not found in CLI help output.")
        );
      }
    }
  }

  if (config.checks.includes("env_vars")) {
    const sourceEnvVars = new Set(sources.envVars.map(normalizeExact));
    for (const item of docs.envVars) {
      if (ignoreEnvVars.has(item.normalized)) {
        continue;
      }
      if (!sourceEnvVars.has(item.normalized)) {
        issues.push(
          makeIssue("env_vars", "missing_in_source", "env_var", item, "Documented environment variable was not found in source file.")
        );
      }
    }
  }

  if (config.checks.includes("config_keys")) {
    const sourceConfigKeys = new Set(sources.configKeys.map(normalizeConfigKey));
    for (const item of docs.configKeys) {
      if (ignoreConfigKeys.has(item.normalized)) {
        continue;
      }
      if (!sourceConfigKeys.has(item.normalized)) {
        issues.push(
          makeIssue("config_keys", "missing_in_source", "config_key", item, "Documented config key was not found in schema or example source.")
        );
      }
    }
  }

  return issues.sort((left, right) => left.value.localeCompare(right.value));
}

function validateConfig(config: ScanConfig): ValidatedScanConfig {
  if (!config.docs || !Array.isArray(config.docs.include) || config.docs.include.length === 0) {
    throw new Error("docs.include must be a non-empty array of Markdown glob patterns.");
  }

  if (!Array.isArray(config.checks) || config.checks.length === 0) {
    throw new Error("checks must be a non-empty array.");
  }

  const allowedChecks = new Set<CheckName>(["cli_flags", "env_vars", "config_keys"]);
  const checks = uniqueItems(config.checks);
  for (const check of checks) {
    if (!allowedChecks.has(check)) {
      throw new Error(`Unsupported check '${check}'.`);
    }
  }

  const format = config.report?.format ?? "text";
  if (format !== "text" && format !== "json") {
    throw new Error(`Unsupported report.format '${String(format)}'.`);
  }

  const allowedIssueKinds = new Set<IssueKind>(["missing_in_source", "missing_in_docs", "parse_error"]);
  const failOn = uniqueItems((config.report?.failOn ?? ["missing_in_source"]) as IssueKind[]);
  for (const issueKind of failOn) {
    if (!allowedIssueKinds.has(issueKind)) {
      throw new Error(`Unsupported failOn issue kind '${issueKind}'.`);
    }
  }

  return {
    docs: {
      include: uniqueItems(config.docs.include),
      exclude: uniqueItems(config.docs.exclude ?? [])
    },
    sources: config.sources ?? {},
    checks,
    ignore: {
      cliFlags: uniqueItems(config.ignore?.cliFlags ?? []),
      envVars: uniqueItems(config.ignore?.envVars ?? []),
      configKeys: uniqueItems(config.ignore?.configKeys ?? [])
    },
    report: {
      format,
      failOn
    }
  };
}

function makeIssue(
  check: CheckName,
  kind: IssueKind,
  entityType: EntityType,
  item: EntityRecord,
  message: string
): DriftIssue {
  return {
    check,
    kind,
    entityType,
    value: item.value,
    normalized: item.normalized,
    files: item.files,
    message
  };
}

function makeParseError(check: CheckName, value: string, message: string, error: unknown): DriftIssue {
  const details = error instanceof Error ? error.message : String(error);
  return {
    check,
    kind: "parse_error",
    entityType: check === "cli_flags" ? "command" : check === "env_vars" ? "env_var" : "config_key",
    value,
    normalized: value,
    files: [],
    message: `${message} ${details}`
  };
}

function extractMarkdownFacts(content: string): {
  commands: string[];
  flags: string[];
  envVars: string[];
  configKeys: string[];
} {
  const commands = new Set<string>();
  const flags = new Set<string>();
  const envVars = new Set<string>();
  const configKeys = new Set<string>();
  const codeMatches = content.match(/```[\s\S]*?```/g) ?? [];
  const inlineMatches = content.match(/`[^`\n]+`/g) ?? [];
  const codeSegments = [...codeMatches.map(stripFenceBlock), ...inlineMatches.map(stripInlineCode)];
  const knownFileExtensions = new Set(["md", "json", "yaml", "yml", "js", "ts", "sh", "example"]);

  for (const segment of codeSegments) {
    for (const line of segment.split(/\r?\n/)) {
      const candidate = extractCommandFromLine(line);
      if (candidate) {
        commands.add(candidate);
      }
    }

    for (const match of segment.matchAll(/(^|\s)(--?[a-z0-9][a-z0-9-]*)(?=[\s=,`]|$)/gim)) {
      flags.add(match[2]);
    }
  }

  for (const match of content.matchAll(/(^|\s)(--?[a-z0-9][a-z0-9-]*)(?=[\s=,`<]|$)/gim)) {
    flags.add(match[2]);
  }

  for (const segment of codeSegments) {
    for (const match of segment.matchAll(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g)) {
      envVars.add(match[0]);
    }

    for (const match of segment.matchAll(/\b[a-z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)+\b/g)) {
      const value = match[0];
      const lastSegment = value.split(".").at(-1)?.toLowerCase() ?? "";
      const segments = value.split(".");
      const hasNumericOnlySegment = segments.some((segment) => /^\d+$/.test(segment));
      if (!value.startsWith("--") && !knownFileExtensions.has(lastSegment) && !hasNumericOnlySegment) {
        configKeys.add(value);
      }
    }
  }

  return {
    commands: [...commands],
    flags: [...flags],
    envVars: [...envVars],
    configKeys: [...configKeys]
  };
}

async function extractCliFacts(repositoryRoot: string, command: string): Promise<{ commands: string[]; flags: string[] }> {
  if (!command.trim()) {
    throw new Error("CLI command is empty.");
  }

  const output = await readCliOutput(repositoryRoot, command);
  const commands = new Set<string>();
  const flags = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    const command = extractCommandFromLine(trimmed);
    if (command) {
      commands.add(command);
    }

    for (const match of trimmed.matchAll(/(^|\s)(--?[a-z0-9][a-z0-9-]*)(?=[\s=,]|$)/gim)) {
      flags.add(match[2]);
    }
  }

  return { commands: [...commands], flags: [...flags] };
}

async function readCliOutput(repositoryRoot: string, command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: repositoryRoot });
    return `${stdout}\n${stderr}`;
  } catch (error: unknown) {
    const stdout = getExecOutput(error, "stdout");
    const stderr = getExecOutput(error, "stderr");
    const output = `${stdout}\n${stderr}`.trim();
    if (output) {
      return output;
    }
    throw error;
  }
}

function getExecOutput(error: unknown, key: "stdout" | "stderr"): string {
  if (!error || typeof error !== "object" || !(key in error)) {
    return "";
  }

  const value = (error as Record<"stdout" | "stderr", unknown>)[key];
  return typeof value === "string" ? value : Buffer.isBuffer(value) ? value.toString("utf8") : "";
}

async function extractEnvVars(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, "utf8");
  const vars = new Set<string>();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Z][A-Z0-9_]*)=/);
    if (match) {
      vars.add(match[1]);
    }
  }

  return [...vars];
}

async function extractConfigKeys(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, "utf8");

  if (filePath.endsWith(".json")) {
    return flattenConfigKeys(JSON.parse(content), []);
  }

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return flattenConfigKeys(parseSimpleYaml(content), []);
  }

  return [];
}

function flattenConfigKeys(input: unknown, currentPath: string[]): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }

  const object = input as Record<string, unknown>;
  if ("properties" in object && typeof object.properties === "object" && object.properties && !Array.isArray(object.properties)) {
    const properties = object.properties as Record<string, unknown>;
    const results: string[] = [];
    for (const [key, value] of Object.entries(properties)) {
      const nextPath = [...currentPath, key];
      results.push(nextPath.join("."));
      results.push(...flattenConfigKeys(value, nextPath));
    }
    return results;
  }

  const results: string[] = [];
  for (const [key, value] of Object.entries(object)) {
    const nextPath = [...currentPath, key];
    results.push(nextPath.join("."));
    if (value && typeof value === "object" && !Array.isArray(value)) {
      results.push(...flattenConfigKeys(value, nextPath));
    }
  }

  return results;
}

function mergeRecords(
  target: Map<string, EntityRecord>,
  values: string[],
  file: string,
  normalize: (value: string) => string
): void {
  for (const value of values) {
    const normalized = normalize(value);
    if (!normalized) {
      continue;
    }

    const existing = target.get(normalized);
    if (existing) {
      if (!existing.files.includes(file)) {
        existing.files.push(file);
      }
      continue;
    }

    target.set(normalized, { value, normalized, files: [file] });
  }
}

async function resolveDocFiles(repositoryRoot: string, includePatterns: string[], excludePatterns: string[]): Promise<string[]> {
  const allFiles = await walkFiles(repositoryRoot);
  return allFiles
    .filter((file) => file.endsWith(".md"))
    .filter((file) => includePatterns.some((pattern) => globMatch(file, pattern)))
    .filter((file) => !excludePatterns.some((pattern) => globMatch(file, pattern)))
    .sort();
}

async function walkFiles(root: string, relativeRoot = ""): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, relativeRoot), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }

    const relativePath = path.posix.join(relativeRoot.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, relativePath)));
    } else {
      files.push(relativePath);
    }
  }

  return files;
}

function globMatch(file: string, pattern: string): boolean {
  const normalizedFile = file.replace(/\\/g, "/");
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const escaped = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, DOUBLE_STAR_SENTINEL)
    .replace(/\*/g, "[^/]*")
    .replace(new RegExp(DOUBLE_STAR_SENTINEL, "g"), ".*");

  return new RegExp(`^${escaped}$`, "i").test(normalizedFile);
}

function splitCommand(command: string): string[] {
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"(.*)"$/, "$1")) ?? [];
}

function stripFenceBlock(segment: string): string {
  return segment.replace(/^```[^\n]*\r?\n?/, "").replace(/\r?\n?```$/, "");
}

function stripInlineCode(segment: string): string {
  return segment.replace(/^`|`$/g, "");
}

function extractCommandFromLine(line: string): string {
  const strippedPrompt = line.trim().replace(/^(?:[$>]\s*)+/, "");
  if (!strippedPrompt || strippedPrompt.startsWith("#")) {
    return "";
  }

  if (/[{}[\]]/.test(strippedPrompt)) {
    return "";
  }

  let remaining = strippedPrompt;
  while (/^[A-Z_][A-Z0-9_]*=/.test(remaining)) {
    remaining = remaining.replace(/^[A-Z_][A-Z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s*/, "");
  }

  const tokens = remaining.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return "";
  }

  const first = tokens[0];
  const reservedWords = new Set([
    "accepts",
    "declare",
    "default",
    "defaults",
    "description",
    "example",
    "examples",
    "export",
    "flags",
    "interface",
    "not",
    "options",
    "usage"
  ]);

  if (!/^[a-z0-9][a-z0-9:_-]*$/.test(first) || reservedWords.has(first.toLowerCase())) {
    return "";
  }

  const commandTokens: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("-")) {
      break;
    }
    if (
      token.includes("/") ||
      token.includes("\\") ||
      token.includes(".") ||
      token.includes("<") ||
      token.includes(">") ||
      token.includes("|") ||
      token.includes(":")
    ) {
      break;
    }
    if (!/^[a-z0-9:_-]+$/.test(token)) {
      break;
    }
    commandTokens.push(token);
    if (commandTokens.length === 2) {
      break;
    }
  }

  return commandTokens.join(" ");
}

function parseSimpleYaml(content: string): unknown {
  const root: Record<string, unknown> = {};
  const lines = content.split(/\r?\n/);
  const stack: Array<{ indent: number; value: Record<string, unknown> | unknown[] }> = [{ indent: -1, value: root }];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const withoutComments = stripYamlComment(rawLine);
    if (!withoutComments.trim()) {
      continue;
    }

    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    const trimmed = withoutComments.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].value;

    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(parent)) {
        continue;
      }
      parent.push(parseScalar(trimmed.slice(2).trim()));
      continue;
    }

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rest = trimmed.slice(separatorIndex + 1).trim();
    if (rest) {
      (parent as Record<string, unknown>)[key] = parseScalar(rest);
      continue;
    }

    const nextSignificant = findNextSignificantLine(lines, index + 1);
    const container =
      nextSignificant && nextSignificant.indent > indent && nextSignificant.trimmed.startsWith("- ") ? [] : {};
    (parent as Record<string, unknown>)[key] = container;
    stack.push({ indent, value: container });
  }

  return root;
}

function findNextSignificantLine(lines: string[], startIndex: number): { indent: number; trimmed: string } | null {
  for (let index = startIndex; index < lines.length; index += 1) {
    const withoutComments = stripYamlComment(lines[index]);
    const trimmed = withoutComments.trim();
    if (!trimmed) {
      continue;
    }

    return {
      indent: lines[index].match(/^ */)?.[0].length ?? 0,
      trimmed
    };
  }

  return null;
}

function stripYamlComment(line: string): string {
  const hashIndex = line.indexOf("#");
  return hashIndex === -1 ? line : line.slice(0, hashIndex);
}

function parseScalar(value: string): unknown {
  if (value === "[]") {
    return [];
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => parseScalar(item));
  }

  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value.replace(/^['"]|['"]$/g, "");
}

function normalizeFlag(value: string): string {
  return value.trim().replace(/^-+/, "").toLowerCase();
}

function normalizeCommand(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  if (normalized.startsWith("npx ")) {
    return normalized.slice(4);
  }
  if (normalized.startsWith("pnpm dlx ")) {
    return normalized.slice(9);
  }
  if (normalized.startsWith("yarn dlx ")) {
    return normalized.slice(9);
  }
  if (normalized.startsWith("bunx ")) {
    return normalized.slice(5);
  }
  return normalized;
}

function normalizeConfigKey(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function normalizeExact(value: string): string {
  return value.trim();
}

function uniqueItems<T>(values: T[]): T[] {
  return [...new Set(values)];
}

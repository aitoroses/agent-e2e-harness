import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { z } from "zod/v4";
import type { ArtifactRef, JourneyProfile, MaybePromise } from "../core/index.js";
import { safePathSegment, timestampSegment } from "../artifacts/index.js";

type RuntimeZodSchema = z.ZodType<unknown>;

export type RuntimeTargetKind = "managed" | "attached";
export type RuntimeLifecycleOwner = "harness" | "external";
export type RuntimeStatus = "ready" | "degraded" | "stopped" | "failed" | "unknown";
export type RuntimeToolRisk = "observation" | "runMutation" | "runtimeMutation";
export type RuntimeAccessState = "available" | "missing" | "blocked" | "requires-bootstrap";
export type RuntimeAccessKind =
  | "browserStorageState"
  | "browserCookies"
  | "apiCredential"
  | "runtimeLogs"
  | "databaseRead"
  | "shellExec"
  | "tunnel"
  | (string & {});

export interface RuntimeServiceStatus {
  id: string;
  status: RuntimeStatus;
  kind?: string;
  url?: string;
  endpoints?: Array<{ id: string; kind: string; url?: string; sensitive?: boolean }>;
  checks?: Array<{ id: string; status: "passed" | "failed" | "warning"; summary: string }>;
}

export interface RuntimeStatusPacket {
  status: RuntimeStatus;
  summary: string;
  services: RuntimeServiceStatus[];
  artifacts: Array<{ id: string; kind: string; uri: string }>;
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
  next?: { actions: Array<{ id?: string; tool?: string; input?: Record<string, unknown>; why: string }> };
}

export interface RuntimeLogEntry {
  timestamp?: string;
  level?: string;
  serviceId?: string;
  message: string;
  fields?: Record<string, unknown>;
}

export interface RuntimeLogsInput {
  tail: number;
  serviceId?: string;
  level?: string;
}

export interface RuntimeLogsOutput {
  status: "ok" | "failed";
  summary: string;
  targetId: string;
  serviceId?: string;
  level?: string;
  tail: number;
  entries: RuntimeLogEntry[];
  truncated: boolean;
  artifacts?: readonly ArtifactRef[];
  error?: { code: string; message: string };
}

export interface RuntimeAccessContextDefinition {
  id: string;
  kind: RuntimeAccessKind;
  label?: string;
  description?: string;
  schema?: RuntimeZodSchema;
  resolver?: RuntimeAccessResolver;
}

export interface RuntimeAccessMaterialized {
  status: RuntimeAccessState;
  summary: string;
  guidance?: readonly string[];
  material?: unknown;
}

export interface RuntimeAccessResolver {
  resolve(context: {
    target: RuntimeTarget;
    access: RuntimeAccessContextDefinition;
  }): MaybePromise<RuntimeAccessMaterialized>;
}

export interface RuntimeAccessStatus {
  id: string;
  kind: RuntimeAccessKind;
  label?: string;
  description?: string;
  status: RuntimeAccessState;
  summary: string;
  guidance: readonly string[];
}

export interface RuntimeExploreToolDefinition<
  TInputSchema extends RuntimeZodSchema = RuntimeZodSchema,
  TOutputSchema extends RuntimeZodSchema = RuntimeZodSchema,
> {
  id: string;
  title: string;
  description: string;
  risk: RuntimeToolRisk;
  input: TInputSchema;
  output: TOutputSchema;
  access?: readonly string[];
  run(args: {
    input: z.infer<TInputSchema>;
    target: RuntimeTarget;
  }): MaybePromise<z.infer<TOutputSchema>>;
}

export interface RuntimeExploreToolDescriptor {
  id: string;
  title: string;
  description: string;
  risk: RuntimeToolRisk;
  access: readonly string[];
  inputSchema: unknown;
  outputSchema: unknown;
}

export interface RuntimeTargetConfig {
  id: string;
  label?: string;
  description?: string;
  status?: () => MaybePromise<RuntimeStatusPacket>;
  logs?: (input: RuntimeLogsInput) => MaybePromise<RuntimeLogsOutput>;
  access?: readonly RuntimeAccessContextDefinition[];
  explore?: readonly RuntimeExploreToolDefinition<any, any>[];
}

export interface RuntimeTarget extends RuntimeTargetConfig {
  kind: RuntimeTargetKind;
  lifecycleOwner: RuntimeLifecycleOwner;
}

export interface RuntimeTargetSummary {
  id: string;
  kind: RuntimeTargetKind;
  lifecycleOwner: RuntimeLifecycleOwner;
  label?: string;
  description?: string;
  capabilities: string[];
}

export function managedRuntime(config: RuntimeTargetConfig): RuntimeTarget {
  return { ...config, kind: "managed", lifecycleOwner: "harness" };
}

export function attachedRuntime(config: RuntimeTargetConfig): RuntimeTarget {
  return { ...config, kind: "attached", lifecycleOwner: "external" };
}

export function defineRuntimeExploreTool<
  const TInputSchema extends RuntimeZodSchema,
  const TOutputSchema extends RuntimeZodSchema,
>(
  tool: RuntimeExploreToolDefinition<TInputSchema, TOutputSchema>,
): RuntimeExploreToolDefinition<TInputSchema, TOutputSchema> {
  return tool;
}

export interface RuntimeTargetRegistry {
  list(): readonly RuntimeTargetSummary[];
  get(targetId: string): RuntimeTarget | undefined;
  require(targetId: string): RuntimeTarget;
  resolveProfileTarget(profile: JourneyProfile<any>): RuntimeTarget | undefined;
  profileAllowsRunMutation(profile: JourneyProfile<any>, toolId: string): boolean;
  profileAllowsRunLifecycle(profile: JourneyProfile<any>): boolean;
}

export function createRuntimeTargetRegistry(input: {
  targets?: readonly RuntimeTarget[];
}): RuntimeTargetRegistry {
  const targets = input.targets ?? [];
  const byId = new Map<string, RuntimeTarget>();
  for (const target of targets) {
    if (byId.has(target.id)) throw new Error(`Duplicate Runtime Target id: ${target.id}`);
    byId.set(target.id, target);
  }

  function targetIdFor(profile: JourneyProfile<any>): string | undefined {
    return profile.runtime?.targetId ?? profile.runtimeTargetId;
  }

  return {
    list: () => targets.map(summarizeRuntimeTarget),
    get: (targetId) => byId.get(targetId),
    require(targetId) {
      const target = byId.get(targetId);
      if (!target) throw new Error(`Unknown Runtime Target: ${targetId}`);
      return target;
    },
    resolveProfileTarget(profile) {
      const targetId = targetIdFor(profile);
      return targetId ? this.require(targetId) : undefined;
    },
    profileAllowsRunMutation(profile, toolId) {
      const policy = profile.runtime?.allowRunMutationTools;
      return policy === true || (Array.isArray(policy) && policy.includes(toolId));
    },
    profileAllowsRunLifecycle(profile) {
      return profile.runtime?.allowRunLifecycle === true;
    },
  };
}

export function summarizeRuntimeTarget(target: RuntimeTarget): RuntimeTargetSummary {
  const capabilities = ["status"];
  if (target.logs) capabilities.push("logs");
  if ((target.access ?? []).length > 0) capabilities.push("access");
  if ((target.explore ?? []).length > 0) capabilities.push("explore");
  return compactObject({
    id: target.id,
    kind: target.kind,
    lifecycleOwner: target.lifecycleOwner,
    label: target.label,
    description: target.description,
    capabilities,
  }) as RuntimeTargetSummary;
}

export async function runtimeStatus(target: RuntimeTarget): Promise<RuntimeStatusPacket> {
  if (target.status) return await target.status();
  return {
    status: target.kind === "attached" ? "unknown" : "stopped",
    summary: `${target.label ?? target.id} has no runtime status adapter configured.`,
    services: [],
    artifacts: [],
    warnings: [{ code: "runtime-status-adapter-missing", message: "No status adapter is configured for this Runtime Target." }],
    errors: [],
  };
}

export async function runtimeAccessStatus(target: RuntimeTarget): Promise<RuntimeAccessStatus[]> {
  const access = target.access ?? [];
  const results: RuntimeAccessStatus[] = [];
  for (const item of access) {
    const resolved = item.resolver
      ? await item.resolver.resolve({ target, access: item })
      : { status: "available" as const, summary: "Access context is declared." };
    results.push(compactObject({
      id: item.id,
      kind: item.kind,
      label: item.label,
      description: item.description,
      status: resolved.status,
      summary: resolved.summary,
      guidance: resolved.guidance ?? [],
    }) as RuntimeAccessStatus);
  }
  return results;
}

export async function runtimeExploreDescriptors(
  target: RuntimeTarget,
): Promise<readonly RuntimeExploreToolDescriptor[]> {
  const { z } = await import("zod/v4");
  return (target.explore ?? []).map((tool) => ({
    id: tool.id,
    title: tool.title,
    description: tool.description,
    risk: tool.risk,
    access: tool.access ?? [],
    inputSchema: z.toJSONSchema(tool.input),
    outputSchema: z.toJSONSchema(tool.output),
  }));
}

export async function runRuntimeExploreTool(
  target: RuntimeTarget,
  toolId: string,
  input: unknown,
): Promise<unknown> {
  const tool = (target.explore ?? []).find((candidate) => candidate.id === toolId);
  if (!tool) throw new Error(`Unknown Runtime Exploration Tool: ${toolId}`);
  const parsedInput = tool.input.safeParse(input);
  if (!parsedInput.success)
    throw new Error(`Invalid runtime exploration input for ${toolId}: ${parsedInput.error.message}`);
  const output = await tool.run({ input: parsedInput.data, target });
  const parsedOutput = tool.output.safeParse(output);
  if (!parsedOutput.success)
    throw new Error(`Invalid runtime exploration output for ${toolId}: ${parsedOutput.error.message}`);
  return parsedOutput.data;
}

export async function writeRuntimeLogsArtifact(input: {
  artifactRoot?: string;
  targetId: string;
  logs: RuntimeLogsOutput;
}): Promise<ArtifactRef> {
  const root = resolve(input.artifactRoot ?? ".agents-e2e/artifacts");
  const dir = join(root, "_runtime", safePathSegment(input.targetId));
  await mkdir(dir, { recursive: true });
  const fileName = `runtime-logs-${timestampSegment(new Date())}.json`;
  const path = join(dir, fileName);
  await writeFile(path, `${JSON.stringify(input.logs, null, 2)}\n`, "utf8");
  return {
    id: `artifact:runtime-logs:${safePathSegment(input.targetId)}:${safePathSegment(fileName)}`,
    kind: "json",
    uri: pathToFileURL(path).href,
    path,
    name: "runtime-logs",
    mediaType: "application/json",
    description: `Runtime logs for ${input.targetId}.`,
  };
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as Partial<T>;
}

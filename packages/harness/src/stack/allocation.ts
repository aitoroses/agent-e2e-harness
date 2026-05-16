import { createServer } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { safePathSegment } from "../artifacts/index.js";

export type StackStartMode = "dev" | "verify";

export interface StackArtifactScope {
  rootDir: string;
  stackDir: string;
}

export interface StackStartContextOptions {
  mode: StackStartMode;
  stackId: string;
  workerIndex?: number;
  workerCount?: number;
  suiteId?: string;
  artifactRoot: string;
}

export interface StackPortAllocation {
  name: string;
  host: string;
  port: number;
  protocol: string;
  url: string;
}

export interface StackPortAllocationOptions {
  host?: string;
  protocol?: string;
}

export interface StackArtifactPathAllocation {
  name: string;
  kind: "file" | "directory";
  path: string;
  uri: string;
}

export interface StackArtifactPathAllocationOptions {
  kind: "file" | "directory";
  extension?: string;
}

export type StackAllocationRecord =
  | {
      kind: "port";
      name: string;
      stackId: string;
      workerIndex?: number;
      resource: {
        host: string;
        port: number;
        url: string;
      };
    }
  | {
      kind: "artifact-file" | "artifact-directory";
      name: string;
      stackId: string;
      workerIndex?: number;
      resource: {
        path: string;
        uri: string;
      };
    };

export interface StackStartContext {
  mode: StackStartMode;
  stackId: string;
  workerIndex?: number;
  workerCount: number;
  suiteId?: string;
  artifactScope: StackArtifactScope;
  allocatePort(name: string, options?: StackPortAllocationOptions): Promise<StackPortAllocation>;
  allocateArtifactPath(name: string, options: StackArtifactPathAllocationOptions): StackArtifactPathAllocation;
  allocations(): readonly StackAllocationRecord[];
}

const reservedPorts = new Set<number>();

export async function allocateTcpPort(host = "127.0.0.1"): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address) resolvePort(address.port);
        else reject(new Error("Could not allocate a TCP port."));
      });
    });
  });
}

export function createStackStartContext(options: StackStartContextOptions): StackStartContext {
  const records: StackAllocationRecord[] = [];
  const ports = new Map<string, StackPortAllocation>();
  const artifactPaths = new Map<string, StackArtifactPathAllocation>();
  const artifactScope: StackArtifactScope = {
    rootDir: resolve(options.artifactRoot),
    stackDir: stackArtifactDir(options),
  };

  const base = {
    mode: options.mode,
    stackId: options.stackId,
    workerCount: options.workerCount ?? 1,
    artifactScope,
    allocatePort: async (name: string, allocationOptions?: StackPortAllocationOptions) => {
      const key = allocationKey("port", name);
      const existing = ports.get(key);
      if (existing) return existing;

      const host = allocationOptions?.host ?? "127.0.0.1";
      const protocol = allocationOptions?.protocol ?? "http";
      const port = await allocateReservedPort(host);
      const allocation: StackPortAllocation = {
        name,
        host,
        port,
        protocol,
        url: `${protocol}://${host}:${port}`,
      };
      ports.set(key, allocation);
      records.push(withWorkerIndex(options, {
        kind: "port",
        name,
        stackId: options.stackId,
        resource: {
          host,
          port,
          url: allocation.url,
        },
      }));
      return allocation;
    },
    allocateArtifactPath: (
      name: string,
      allocationOptions: StackArtifactPathAllocationOptions,
    ) => {
      const key = allocationKey(allocationOptions.kind, name);
      const existing = artifactPaths.get(key);
      if (existing) return existing;

      const path = resolve(
        artifactScope.stackDir,
        artifactPathSegment(name, allocationOptions),
      );
      const allocation: StackArtifactPathAllocation = {
        name,
        kind: allocationOptions.kind,
        path,
        uri: pathToFileURL(path).href,
      };
      artifactPaths.set(key, allocation);
      records.push(withWorkerIndex(options, {
        kind: allocationOptions.kind === "file" ? "artifact-file" : "artifact-directory",
        name,
        stackId: options.stackId,
        resource: {
          path: allocation.path,
          uri: allocation.uri,
        },
      }));
      return allocation;
    },
    allocations: () => records.map((record) => ({ ...record })),
  } satisfies Omit<StackStartContext, "workerIndex" | "suiteId">;

  return withOptionalContextIdentity(options, base);
}

async function allocateReservedPort(host: string): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const port = await allocateTcpPort(host);
    if (!reservedPorts.has(port)) {
      reservedPorts.add(port);
      return port;
    }
  }
  throw new Error("Could not allocate a collision-free TCP port.");
}

function stackArtifactDir(options: StackStartContextOptions): string {
  const rootDir = resolve(options.artifactRoot);
  if (options.mode === "verify" && options.suiteId) {
    return resolve(
      rootDir,
      "_suites",
      safePathSegment(options.suiteId),
      "stacks",
      safePathSegment(options.stackId),
    );
  }
  return resolve(rootDir, "stacks", safePathSegment(options.stackId));
}

function artifactPathSegment(
  name: string,
  options: StackArtifactPathAllocationOptions,
): string {
  const segment = safePathSegment(name);
  if (options.kind === "directory") return segment;
  const extension = options.extension ? normalizeExtension(options.extension) : "";
  return `${segment}${extension}`;
}

function normalizeExtension(extension: string): string {
  if (extension.length === 0) return "";
  return extension.startsWith(".") ? extension : `.${extension}`;
}

function allocationKey(kind: string, name: string): string {
  return `${kind}:${name}`;
}

function withWorkerIndex<T extends { workerIndex?: number }>(
  options: StackStartContextOptions,
  value: Omit<T, "workerIndex">,
): T {
  return options.workerIndex === undefined
    ? value as T
    : { ...value, workerIndex: options.workerIndex } as T;
}

function withOptionalContextIdentity(
  options: StackStartContextOptions,
  value: Omit<StackStartContext, "workerIndex" | "suiteId">,
): StackStartContext {
  return {
    ...value,
    ...(options.workerIndex !== undefined ? { workerIndex: options.workerIndex } : {}),
    ...(options.suiteId !== undefined ? { suiteId: options.suiteId } : {}),
  };
}

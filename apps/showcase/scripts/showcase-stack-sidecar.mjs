#!/usr/bin/env node
import { createInterface } from "node:readline";
import { createProcessStackProvider } from "@agent-e2e/harness/stack";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";

let activeStack;
let shuttingDown = false;

const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  void handleRequestLine(line);
});

process.once("SIGINT", () => {
  void shutdown(0);
});
process.once("SIGTERM", () => {
  void shutdown(0);
});

async function handleRequestLine(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    writeResponse(0, false, undefined, `Invalid JSON request: ${messageFor(error)}`);
    return;
  }

  const id = typeof request.id === "number" ? request.id : 0;
  try {
    if (request.method === "start") {
      writeResponse(id, true, { stack: await startStack(request.params ?? {}) });
      return;
    }
    if (request.method === "status") {
      writeResponse(id, true, { stack: await statusStack() });
      return;
    }
    if (request.method === "stop") {
      writeResponse(id, true, { stack: await stopStack() });
      return;
    }
    writeResponse(id, false, undefined, `Unknown sidecar method: ${request.method}`);
  } catch (error) {
    writeResponse(id, false, undefined, messageFor(error));
  }
}

async function startStack(params) {
  if (activeStack)
    throw new Error("Showcase sidecar stack is already running.");

  const appHost = stringParam(params, "appHost");
  const appPort = numberParam(params, "appPort");
  const appUrl = stringParam(params, "appUrl");
  const database = stringParam(params, "database");
  const logPath = stringParam(params, "logPath");
  const password = stringParam(params, "password");
  const postgresImage = stringParam(params, "postgresImage");
  const readyTimeoutMs = numberParam(params, "readyTimeoutMs");
  const repoRoot = stringParam(params, "repoRoot");
  const schemaSql = stringParam(params, "schemaSql");
  const username = stringParam(params, "username");

  const postgres = await new PostgreSqlContainer(postgresImage)
    .withDatabase(database)
    .withUsername(username)
    .withPassword(password)
    .start();
  const postgresHandle = {
    connectionUri: postgres.getConnectionUri(),
    database: postgres.getDatabase(),
    host: postgres.getHost(),
    id: postgres.getId(),
    password: postgres.getPassword(),
    port: postgres.getPort(),
    username: postgres.getUsername(),
  };

  try {
    await runSchema(postgresHandle.connectionUri, schemaSql);
    const app = createProcessStackProvider({
      id: "showcase-next-dev",
      serviceId: "showcase-next-dev",
      serviceUrl: appUrl,
      readyUrl: `${appUrl}/api/notes`,
      readyTimeoutMs,
      command: "npm",
      args: [
        "run",
        "dev",
        "--workspace",
        "@agent-e2e/showcase",
        "--",
        "--hostname",
        appHost,
        "--port",
        String(appPort),
      ],
      cwd: repoRoot,
      env: {
        DATABASE_URL: postgresHandle.connectionUri,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      logPath,
    });
    const appHandle = await app.start();
    activeStack = { app, appHandle, appUrl, postgres, postgresHandle };
    return await statusStack();
  } catch (error) {
    await postgres.stop().catch(() => undefined);
    throw error;
  }
}

async function statusStack() {
  if (!activeStack) return stoppedStackStatus();
  const [appStatus, postgresStatus] = await Promise.all([
    activeStack.app.status(activeStack.appHandle),
    Promise.resolve(postgresStatusPacket("ready", activeStack.postgresHandle)),
  ]);
  return combineStatus(
    appStatus.status === "ready" && postgresStatus.status === "ready" ? "ready" : "degraded",
    `Showcase dev stack ${appStatus.status === "ready" ? "ready" : "not ready"} at ${activeStack.appUrl}`,
    appStatus,
    postgresStatus,
  );
}

async function stopStack() {
  if (!activeStack) return stoppedStackStatus();
  const stack = activeStack;
  activeStack = undefined;
  const [appStopped, postgresStopped] = await Promise.all([
    stack.app.stop(stack.appHandle),
    stack.postgres.stop().then(() => postgresStatusPacket("stopped", stack.postgresHandle)),
  ]);
  return combineStatus("stopped", "Showcase dev stack stopped.", appStopped, postgresStopped);
}

async function runSchema(connectionUri, schemaSql) {
  const client = new Client({ connectionString: connectionUri });
  await client.connect();
  try {
    await client.query(schemaSql);
  } finally {
    await client.end();
  }
}

function combineStatus(status, summary, ...packets) {
  return {
    status,
    summary,
    services: packets.flatMap((packet) => packet.services),
    artifacts: packets.flatMap((packet) => packet.artifacts),
    warnings: packets.flatMap((packet) => packet.warnings),
    errors: packets.flatMap((packet) => packet.errors),
  };
}

function postgresStatusPacket(status, handle) {
  return {
    status,
    summary:
      status === "ready"
        ? "Showcase PostgreSQL Testcontainer is ready."
        : "Showcase PostgreSQL Testcontainer stopped.",
    services: [
      {
        id: "postgres",
        status,
        url: handle.connectionUri,
      },
    ],
    artifacts: [],
    warnings: [],
    errors: [],
  };
}

function stoppedStackStatus() {
  return {
    status: "stopped",
    summary: "No managed stack handle is active.",
    services: [],
    artifacts: [],
    warnings: [],
    errors: [],
  };
}

function stringParam(params, name) {
  const value = params[name];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Missing sidecar string parameter: ${name}`);
  return value;
}

function numberParam(params, name) {
  const value = params[name];
  if (!Number.isInteger(value))
    throw new Error(`Missing sidecar integer parameter: ${name}`);
  return value;
}

function writeResponse(id, ok, result, error) {
  const payload = ok ? { id, ok, result } : { id, ok, error };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function messageFor(error) {
  return error instanceof Error ? error.message : String(error);
}

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopStack().catch((error) => {
    process.stderr.write(`${messageFor(error)}\n`);
  });
  process.exit(code);
}

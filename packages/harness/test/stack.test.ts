import { describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import {
  allocateTcpPort,
  createStackStartContext,
} from '@agent-e2e/harness/stack';

describe('managed stack port allocation', () => {
  it('allocates a localhost TCP port that a managed dev process can bind', async () => {
    const port = await allocateTcpPort('127.0.0.1');
    expect(port).toBeGreaterThan(0);

    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
});

describe('StackStartContext named allocations', () => {
  it('allocates collision-free named ports and records provider-owned metadata once', async () => {
    const ctx = createStackStartContext({
      mode: 'verify',
      suiteId: 'suite-1',
      stackId: 'worker-0',
      workerIndex: 0,
      workerCount: 2,
      artifactRoot: '/tmp/agent-e2e-artifacts',
    });

    const app = await ctx.allocatePort('app');
    const api = await ctx.allocatePort('api');

    expect(app).toMatchObject({
      name: 'app',
      host: '127.0.0.1',
      url: `http://127.0.0.1:${app.port}`,
    });
    expect(api.port).not.toBe(app.port);
    expect(ctx.allocations()).toEqual([
      {
        kind: 'port',
        name: 'app',
        stackId: 'worker-0',
        workerIndex: 0,
        resource: {
          host: '127.0.0.1',
          port: app.port,
          url: app.url,
        },
      },
      {
        kind: 'port',
        name: 'api',
        stackId: 'worker-0',
        workerIndex: 0,
        resource: {
          host: '127.0.0.1',
          port: api.port,
          url: api.url,
        },
      },
    ]);
  });

  it('scopes named file and directory artifact paths under the stack artifact directory', () => {
    const ctx = createStackStartContext({
      mode: 'verify',
      suiteId: 'suite:path',
      stackId: 'worker/1',
      workerIndex: 1,
      workerCount: 2,
      artifactRoot: '/tmp/agent-e2e-artifacts',
    });

    const log = ctx.allocateArtifactPath('next dev log', { kind: 'file', extension: 'log' });
    const dataDir = ctx.allocateArtifactPath('postgres data', { kind: 'directory' });

    expect(ctx.artifactScope.stackDir).toBe('/tmp/agent-e2e-artifacts/_suites/suite-path/stacks/worker-1');
    expect(log).toMatchObject({
      name: 'next dev log',
      kind: 'file',
      path: '/tmp/agent-e2e-artifacts/_suites/suite-path/stacks/worker-1/next-dev-log.log',
      uri: 'file:///tmp/agent-e2e-artifacts/_suites/suite-path/stacks/worker-1/next-dev-log.log',
    });
    expect(dataDir).toMatchObject({
      name: 'postgres data',
      kind: 'directory',
      path: '/tmp/agent-e2e-artifacts/_suites/suite-path/stacks/worker-1/postgres-data',
      uri: 'file:///tmp/agent-e2e-artifacts/_suites/suite-path/stacks/worker-1/postgres-data',
    });
    expect(ctx.allocations()).toEqual([
      {
        kind: 'artifact-file',
        name: 'next dev log',
        stackId: 'worker/1',
        workerIndex: 1,
        resource: {
          path: log.path,
          uri: log.uri,
        },
      },
      {
        kind: 'artifact-directory',
        name: 'postgres data',
        stackId: 'worker/1',
        workerIndex: 1,
        resource: {
          path: dataDir.path,
          uri: dataDir.uri,
        },
      },
    ]);
  });
});

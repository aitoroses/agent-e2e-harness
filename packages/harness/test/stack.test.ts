import { describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { allocateTcpPort } from '@agent-e2e/harness/stack';

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

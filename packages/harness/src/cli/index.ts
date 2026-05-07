#!/usr/bin/env node
import {
  defineJourney,
  runClosure,
  type HarnessTypes,
  type ResourceAdapter
} from '../core/index.js';
import { createMcpHarnessServer } from '../mcp/index.js';

type CliHarness = HarnessTypes<
  { runId: string },
  { failSeed?: boolean; failProof?: boolean },
  { message: string },
  { kind: 'record'; id: string }
>;

const demoAdapter: ResourceAdapter<CliHarness> = {
  id: 'demo-record-adapter',
  supports: (resource) => resource.kind === 'record',
  delete: async () => undefined
};

function createDemoJourney(profileData: CliHarness['profileData'] = {}) {
  return defineJourney<CliHarness>({
    id: 'demo',
    title: 'CLI demo journey',
    seed: ({ profile }) =>
      profile.data.failSeed
        ? { errors: [{ code: 'seed.failed', message: 'Demo seed failed' }] }
        : {
            environment: { created: [{ kind: 'record', id: 'demo:seed' }] },
            artifacts: [{ id: 'artifact:demo-seed', kind: 'json', uri: 'artifact://demo/seed.json' }]
          },
    profiles: [{ id: 'default', data: profileData, isDefault: true }],
    phases: [
      {
        id: 'main',
        title: 'Main',
        steps: [
          {
            id: 'message',
            title: 'Message',
            execute: async () => ({
              status: 'passed',
              observed: { message: 'demo' },
              artifacts: [{ id: 'artifact:demo-step', kind: 'json', uri: 'artifact://demo/step.json' }]
            }),
            proofs: [{ id: 'message-proof', title: 'Message proof', check: async ({ profile }) => !profile.data.failProof }]
          }
        ]
      }
    ]
  });
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...flags] = argv;
  const failSeed = flags.includes('--fail-seed');
  const failProof = flags.includes('--fail-proof');
  const journey = createDemoJourney({ failSeed, failProof });
  const server = createMcpHarnessServer({
    journeys: [journey],
    resourceAdapters: [demoAdapter],
    artifactContents: {
      'artifact:demo-seed': { seeded: true },
      'artifact:demo-step': { message: 'demo' }
    }
  });

  switch (command) {
    case 'mcp:start':
      print({ status: 'ok', server: 'reference-mcp', tools: ['listJourneys', 'inspectJourney', 'seedJourney', 'beginRun', 'runStep', 'runPhase', 'readArtifact', 'cleanupPlan', 'teardown'] });
      return 0;
    case 'seed':
      print(await server.callTool('seedJourney', { journeyId: 'demo', execution: { runId: 'cli-seed' } }));
      return failSeed ? 1 : 0;
    case 'run': {
      const begin = await server.callTool('beginRun', { journeyId: 'demo', execution: { runId: 'cli-run' } });
      if (begin.status !== 'ok') {
        print(begin);
        return 1;
      }
      const phase = await server.callTool('runPhase', { runId: 'cli-run', phaseId: 'main' });
      print(phase);
      return hasFailedStep(phase) ? 1 : 0;
    }
    case 'closure': {
      const result = await runClosure(journey, { execution: { runId: 'cli-closure' } });
      print(result);
      return result.crystallized ? 0 : 1;
    }
    case 'artifacts': {
      const begin = await server.callTool('beginRun', { journeyId: 'demo', execution: { runId: 'cli-artifacts' } });
      if (begin.status === 'ok') await server.callTool('runPhase', { runId: 'cli-artifacts', phaseId: 'main' });
      print({ status: 'ok', artifacts: [await server.callTool('readArtifact', { artifactId: 'artifact:demo-seed' }), await server.callTool('readArtifact', { artifactId: 'artifact:demo-step' })] });
      return 0;
    }
    case 'cleanup-plan': {
      const begin = await server.callTool('beginRun', { journeyId: 'demo', execution: { runId: 'cli-cleanup' } });
      if (begin.status !== 'ok') {
        print(begin);
        return 1;
      }
      print(await server.callTool('cleanupPlan', { runId: 'cli-cleanup' }));
      return 0;
    }
    case 'teardown': {
      const begin = await server.callTool('beginRun', { journeyId: 'demo', execution: { runId: 'cli-teardown' } });
      if (begin.status !== 'ok') {
        print(begin);
        return 1;
      }
      print(await server.callTool('teardown', { runId: 'cli-teardown' }));
      return 0;
    }
    default:
      print({ status: 'error', error: `Unknown command: ${command ?? ''}` });
      return 1;
  }
}

function hasFailedStep(response: Record<string, unknown>): boolean {
  const results = response.results;
  return Array.isArray(results) && results.some((result) => typeof result === 'object' && result !== null && 'status' in result && (result as { status?: unknown }).status !== 'passed');
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().then((code) => {
    process.exitCode = code;
  });
}

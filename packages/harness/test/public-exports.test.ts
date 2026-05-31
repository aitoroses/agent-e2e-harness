import { describe, expect, it } from 'vitest';
import { agentE2EDefaultHarnessApi } from '@agent-e2e/harness';
import { agentE2ECoreApi } from '@agent-e2e/harness/core';
import { DEFAULT_AGENT_E2E_ARTIFACT_ROOT } from '@agent-e2e/harness/artifacts';
import { renderTerminalReport } from '@agent-e2e/harness/verify';
import { createStackStartContext, defineStackCapabilities, defineStackCapability } from '@agent-e2e/harness/stack';
import { attachedRuntime, defineRuntimeCapabilities, defineRuntimeCapability } from '@agent-e2e/harness/runtime';

describe('public package exports', () => {
  it('loads the package-root API contract through the package export map', () => {
    expect(agentE2EDefaultHarnessApi).toMatchObject({
      packageName: '@agent-e2e/harness',
      surface: 'default-harness-api',
      status: 'ready'
    });
  });

  it('loads the generic core API contract through the /core subpath export', () => {
    expect(agentE2ECoreApi).toMatchObject({
      packageName: '@agent-e2e/harness',
      surface: 'harness-core',
      status: 'ready'
    });
  });

  it('loads the artifact utilities through the /artifacts subpath export', () => {
    expect(DEFAULT_AGENT_E2E_ARTIFACT_ROOT).toBe('.agents-e2e/artifacts');
  });

  it('loads verify utilities through the /verify subpath export', () => {
    expect(typeof renderTerminalReport).toBe('function');
  });

  it('loads StackStartContext utilities through the /stack subpath export', () => {
    expect(typeof createStackStartContext).toBe('function');
    expect(typeof defineStackCapability).toBe('function');
    expect(typeof defineStackCapabilities).toBe('function');
  });

  it('loads Runtime Target utilities through the /runtime subpath export', () => {
    expect(attachedRuntime({ id: 'attached' })).toMatchObject({
      id: 'attached',
      kind: 'attached',
      lifecycleOwner: 'external'
    });
    expect(typeof defineRuntimeCapability).toBe('function');
    expect(typeof defineRuntimeCapabilities).toBe('function');
  });
});

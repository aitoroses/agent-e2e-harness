import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import {
  attachedRuntime,
  defineRuntimeCapability,
  runtimeCapabilityDefinitions,
} from "@agent-e2e/harness/runtime";
import {
  defineStackCapability,
  stackCapabilityDefinitions,
} from "@agent-e2e/harness/stack";

describe("stackCapabilityDefinitions merge precedence", () => {
  it("prefers the capabilities definition on id collision and appends non-overlapping explore tools", () => {
    const capability = defineStackCapability({
      id: "shared",
      title: "Capability version",
      description: "Declared via capabilities.",
      availableIn: ["dev"],
      risk: "none",
      input: z.object({}),
      output: z.object({ source: z.string() }),
      run: async () => ({ source: "capabilities" }),
    });
    const exploreShadowed = defineStackCapability({
      id: "shared",
      title: "Explore version",
      description: "Declared via the deprecated explore alias.",
      availableIn: ["dev"],
      risk: "none",
      input: z.object({}),
      output: z.object({ source: z.string() }),
      run: async () => ({ source: "explore" }),
    });
    const exploreOnly = defineStackCapability({
      id: "explore-only",
      title: "Explore-only tool",
      description: "Only declared via explore.",
      availableIn: ["dev"],
      risk: "none",
      input: z.object({}),
      output: z.object({}),
      run: async () => ({}),
    });

    const merged = stackCapabilityDefinitions({
      capabilities: [capability],
      explore: [exploreShadowed, exploreOnly],
    });

    expect(merged.map((tool) => tool.id)).toEqual(["shared", "explore-only"]);
    expect(merged.find((tool) => tool.id === "shared")?.title).toBe("Capability version");
  });

  it("falls back to explore-only or capabilities-only when the other side is empty", () => {
    const tool = defineStackCapability({
      id: "only",
      title: "Only",
      description: "Single declaration.",
      availableIn: ["dev"],
      risk: "none",
      input: z.object({}),
      output: z.object({}),
      run: async () => ({}),
    });

    expect(stackCapabilityDefinitions({ explore: [tool] }).map((t) => t.id)).toEqual(["only"]);
    expect(stackCapabilityDefinitions({ capabilities: [tool] }).map((t) => t.id)).toEqual(["only"]);
  });
});

describe("runtimeCapabilityDefinitions merge precedence", () => {
  it("prefers the capabilities definition on id collision and appends non-overlapping explore tools", () => {
    const capability = defineRuntimeCapability({
      id: "shared",
      title: "Capability version",
      description: "Declared via capabilities.",
      risk: "observation",
      input: z.object({}),
      output: z.object({ source: z.string() }),
      run: async () => ({ source: "capabilities" }),
    });
    const exploreShadowed = defineRuntimeCapability({
      id: "shared",
      title: "Explore version",
      description: "Declared via the deprecated explore alias.",
      risk: "observation",
      input: z.object({}),
      output: z.object({ source: z.string() }),
      run: async () => ({ source: "explore" }),
    });
    const exploreOnly = defineRuntimeCapability({
      id: "explore-only",
      title: "Explore-only tool",
      description: "Only declared via explore.",
      risk: "observation",
      input: z.object({}),
      output: z.object({}),
      run: async () => ({}),
    });

    const target = attachedRuntime({
      id: "compose",
      capabilities: [capability],
      explore: [exploreShadowed, exploreOnly],
    });

    const merged = runtimeCapabilityDefinitions(target);

    expect(merged.map((tool) => tool.id)).toEqual(["shared", "explore-only"]);
    expect(merged.find((tool) => tool.id === "shared")?.title).toBe("Capability version");
  });
});

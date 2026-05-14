import { describe, expect, it } from "vitest";
import { defineJourney } from "@agent-e2e/harness/core";
import { selectVerifyRuns } from "../src/verify/selection.js";

function journey(id: string, options: { tags?: readonly string[]; profiles?: readonly string[] } = {}) {
  const profileIds = options.profiles ?? ["default"];
  return defineJourney({
    id,
    title: id,
    ...(options.tags ? { tags: options.tags } : {}),
    profiles: profileIds.map((profileId, index) => ({
      id: profileId,
      data: {},
      isDefault: index === 0,
    })) as [{ id: string; data: Record<string, never>; isDefault: boolean }, ...Array<{ id: string; data: Record<string, never>; isDefault: boolean }>],
    phases: [
      {
        id: "phase:main",
        title: "Main",
        steps: [
          {
            id: "step:main",
            title: "Main",
            execute: async () => ({ status: "passed" }),
          },
        ],
      },
    ],
  });
}

describe("verify selection", () => {
  it("selects every configured journey on its default profile by default", () => {
    const result = selectVerifyRuns({
      journeys: [
        journey("notes:create", { profiles: ["default", "slow"] }),
        journey("notes:delete"),
      ],
    });

    expect(result.selected.map((run) => `${run.journey.id}:${run.profile.id}`)).toEqual([
      "notes:create:default",
      "notes:delete:default",
    ]);
  });

  it("uses suite selectors as a base, narrows with CLI selectors, and subtracts excludes", () => {
    const result = selectVerifyRuns({
      journeys: [
        journey("notes:create", { tags: ["smoke"] }),
        journey("notes:delete", { tags: ["regression"] }),
        journey("billing:create", { tags: ["smoke"] }),
      ],
      suites: [{ id: "smoke", tags: ["smoke"], exclude: ["billing:*"] }],
      options: { suite: "smoke", journey: ["notes:*"] },
    });

    expect(result.selected.map((run) => run.journey.id)).toEqual(["notes:create"]);
  });

  it("treats requested missing profiles as a selection error", () => {
    expect(() =>
      selectVerifyRuns({
        journeys: [journey("notes:create", { profiles: ["default"] })],
        options: { profile: ["mobile"] },
      }),
    ).toThrow("Journey notes:create has no requested profile: mobile");
  });
});

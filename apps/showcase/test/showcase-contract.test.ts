import { describe, expect, it } from "vitest";

import { createShowcaseJourney } from "../src/journey.js";
import { createShowcaseMcpJourney } from "../src/harness/dev-mcp-journey.js";

describe("showcase journey contracts", () => {
  it("keeps the Dev MCP and CI journey contracts aligned", () => {
    const baseUrl = "http://127.0.0.1:3000";
    const ciContract = createShowcaseJourney(baseUrl).toInspectableContract();
    const devMcpContract = createShowcaseMcpJourney(baseUrl).toInspectableContract();

    expect(devMcpContract.id).toBe(ciContract.id);
    expect(devMcpContract.profiles).toEqual(ciContract.profiles);
    expect(devMcpContract.phases.map((phase) => phase.id)).toEqual(
      ciContract.phases.map((phase) => phase.id),
    );

    const ciStep = ciContract.phases[0]?.steps[0];
    const devMcpStep = devMcpContract.phases[0]?.steps[0];
    expect(devMcpStep?.id).toBe(ciStep?.id);
    expect(devMcpStep?.artifacts).toEqual(ciStep?.artifacts);
    expect(devMcpStep?.proofs.map((proof) => proof.id)).toEqual(
      ciStep?.proofs.map((proof) => proof.id),
    );
  });
});

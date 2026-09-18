import { describe, expect, it } from "vitest";

import {
  isOpportunitySnapshotApiRoute,
} from "../worker/opportunity-snapshot-api";


describe("S05.2 opportunity snapshot API routing", () => {
  const opportunityId = "2137765e-63eb-4882-889a-b2e09b7ac8e3";
  const snapshotId = "9206eb0d-2eda-4939-9fbb-1e23609be086";

  it("recognizes the private snapshot metadata route", () => {
    expect(
      isOpportunitySnapshotApiRoute(
        `/api/opportunities/${opportunityId}/snapshots`,
      ),
    ).toBe(true);
  });

  it("recognizes the private snapshot image route", () => {
    expect(
      isOpportunitySnapshotApiRoute(
        `/api/opportunity-snapshots/${snapshotId}/image`,
      ),
    ).toBe(true);
  });

  it("rejects malformed and neighboring opportunity routes", () => {
    expect(
      isOpportunitySnapshotApiRoute(
        "/api/opportunities/not-a-uuid/snapshots",
      ),
    ).toBe(false);

    expect(
      isOpportunitySnapshotApiRoute(
        `/api/opportunities/${opportunityId}`,
      ),
    ).toBe(false);
  });
});

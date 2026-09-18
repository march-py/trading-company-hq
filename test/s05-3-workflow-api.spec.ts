import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isS05WorkflowApiRoute,
} from "../worker/opportunity-workflow-api";

describe(
  "S05.3 workflow API routing",
  () => {
    const opportunityId =
      "2137765e-63eb-4882-889a-b2e09b7ac8e3";

    const notificationId =
      "9206eb0d-2eda-4939-9fbb-1e23609be086";

    it(
      "recognizes opportunity workflow actions",
      () => {
        expect(
          isS05WorkflowApiRoute(
            `/api/opportunities/${opportunityId}/qualify`,
          ),
        ).toBe(true);

        expect(
          isS05WorkflowApiRoute(
            `/api/opportunities/${opportunityId}/alert`,
          ),
        ).toBe(true);

        expect(
          isS05WorkflowApiRoute(
            `/api/opportunities/${opportunityId}/seen`,
          ),
        ).toBe(true);

        expect(
          isS05WorkflowApiRoute(
            `/api/opportunities/${opportunityId}/create-trade-plan`,
          ),
        ).toBe(true);
      },
    );

    it(
      "recognizes notification routes",
      () => {
        expect(
          isS05WorkflowApiRoute(
            "/api/notifications",
          ),
        ).toBe(true);

        expect(
          isS05WorkflowApiRoute(
            `/api/notifications/${notificationId}/read`,
          ),
        ).toBe(true);
      },
    );

    it(
      "rejects malformed and neighboring routes",
      () => {
        expect(
          isS05WorkflowApiRoute(
            "/api/opportunities/not-a-uuid/qualify",
          ),
        ).toBe(false);

        expect(
          isS05WorkflowApiRoute(
            `/api/opportunities/${opportunityId}/delete`,
          ),
        ).toBe(false);

        expect(
          isS05WorkflowApiRoute(
            "/api/notifications/not-a-uuid/read",
          ),
        ).toBe(false);
      },
    );
  },
);

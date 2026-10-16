import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INVITATION_ORGANIZATION_LIMIT,
  normalizeInvitationModules,
} from "./invitation-design";

describe("invitation module item limits", () => {
  it("preserves up to 100 organization units", () => {
    const modules = normalizeInvitationModules([
      {
        id: "organizations",
        type: "organizations",
        items: Array.from(
          { length: INVITATION_ORGANIZATION_LIMIT + 5 },
          (_, index) => ({
            id: `unit-${index}`,
            title: `单位 ${index + 1}`,
          }),
        ),
      },
    ]);

    assert.equal(INVITATION_ORGANIZATION_LIMIT, 100);
    assert.equal(modules[0]?.items?.length, INVITATION_ORGANIZATION_LIMIT);
    assert.equal(modules[0]?.items?.at(-1)?.title, "单位 100");
  });

  it("keeps the existing 20-item limit for other repeatable modules", () => {
    const modules = normalizeInvitationModules([
      {
        id: "carousel",
        type: "carousel",
        items: Array.from({ length: 25 }, (_, index) => ({
          id: `image-${index}`,
          title: `图片 ${index + 1}`,
        })),
      },
    ]);

    assert.equal(modules[0]?.items?.length, 20);
  });
});

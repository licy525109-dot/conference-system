import { describe, it } from "node:test";
import { Test } from "@nestjs/testing";
import { WecomModule } from "./wecom.module";

describe("WecomModule", () => {
  it("compiles with admin auth guards", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WecomModule]
    }).compile();

    await moduleRef.close();
  });
});

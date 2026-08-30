import type { Equal, Expect } from "./assert";

import type { InferPathParams } from "../../src";

type NoParams = Expect<Equal<InferPathParams<"/users">, Record<never, never>>>;

type OneParam = Expect<
  Equal<
    InferPathParams<"/users/:id">,
    {
      id: string;
    }
  >
>;

type MultipleParams = Expect<
  Equal<
    InferPathParams<"/teams/:teamId/users/:userId">,
    {
      teamId: string;
      userId: string;
    }
  >
>;

export type { MultipleParams, NoParams, OneParam };

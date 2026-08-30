import type { Equal, Expect } from "./assert";

type Smoke = Expect<Equal<"gelis", "gelis">>;

export type { Smoke };

type SegmentParam<Segment extends string> = Segment extends `:${infer Param}`
  ? Param
  : never;

type PathParamNames<Path extends string> =
  Path extends `${infer Head}/${infer Tail}`
    ? SegmentParam<Head> | PathParamNames<Tail>
    : SegmentParam<Path>;

export type InferPathParams<Path extends string> = [
  PathParamNames<Path>,
] extends [never]
  ? Record<never, never>
  : {
      [Key in PathParamNames<Path>]: string;
    };

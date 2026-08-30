type SegmentParam<Segment extends string> = Segment extends `:${infer Param}`
  ? Param extends ""
    ? never
    : Param
  : never;

type PathParamNames<Path extends string> =
  Path extends `${infer Head}/${infer Tail}`
    ? SegmentParam<Head> | PathParamNames<Tail>
    : SegmentParam<Path>;

/**
 * Validates route syntax currently supported by Gelis.
 *
 * v0.1 supports:
 * - paths beginning with /
 * - required named parameters such as :id
 *
 * v0.1 deliberately does not support:
 * - optional parameters
 * - wildcards
 */
export type ValidRoutePath<Path extends string> = string extends Path
  ? unknown
  : Path extends `/${string}`
    ? Path extends `${string}?${string}`
      ? never
      : Path extends `${string}*${string}`
        ? never
        : unknown
    : never;

export type InferPathParams<Path extends string> = [
  PathParamNames<Path>,
] extends [never]
  ? Record<never, never>
  : {
      [Key in PathParamNames<Path>]: string;
    };

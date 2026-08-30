import type { AnyApiContractRef, ApiContractOf } from "../../src";

type PublicRouteContract = {
  method: string;
  path: string;

  request: {
    params: unknown;
    query: unknown;
    body: unknown;
  };

  responses: Readonly<Record<number, unknown>>;
};

type PublicModuleContract = Readonly<Record<string, PublicRouteContract>>;

type EmptyObject<Value> = keyof Value extends never ? true : false;

type ParamsArgument<Params> =
  EmptyObject<Params> extends true
    ? {}
    : {
        params: Params;
      };

type QueryArgument<Query> = [Query] extends [never]
  ? {}
  : {
      query: Query;
    };

type BodyArgument<Body> = [Body] extends [never]
  ? {}
  : {
      body: Body;
    };

type ClientRequest<Route extends PublicRouteContract> = ParamsArgument<
  Route["request"]["params"]
> &
  QueryArgument<Route["request"]["query"]> &
  BodyArgument<Route["request"]["body"]>;

type HasRequestInput<Route extends PublicRouteContract> =
  keyof ClientRequest<Route> extends never ? false : true;

type ResponseStatus<Responses extends Readonly<Record<number, unknown>>> =
  Extract<keyof Responses, number>;

type ClientResponse<Responses extends Readonly<Record<number, unknown>>> = {
  [Status in ResponseStatus<Responses>]: {
    status: Status;
    data: Responses[Status];
    headers: Headers;
    response: Response;
  };
}[ResponseStatus<Responses>];

type ClientMethod<Route extends PublicRouteContract> =
  HasRequestInput<Route> extends true
    ? (
        request: ClientRequest<Route>,
      ) => Promise<ClientResponse<Route["responses"]>>
    : () => Promise<ClientResponse<Route["responses"]>>;

type ClientModule<Module extends PublicModuleContract> = {
  readonly [Name in keyof Module]: ClientMethod<Module[Name]>;
};

type ClientEntry<Entry> = Entry extends PublicRouteContract
  ? ClientMethod<Entry>
  : Entry extends PublicModuleContract
    ? ClientModule<Entry>
    : never;

type ClientContract<Contract extends AnyApiContractRef> =
  ApiContractOf<Contract>;

export type GelisClient<Contract extends AnyApiContractRef> = {
  readonly [Name in keyof ClientContract<Contract>]: ClientEntry<
    ClientContract<Contract>[Name]
  >;
};

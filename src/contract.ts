import type { AnyModuleRef, ModuleContractOf } from "./module";

import type { AnyRouteRef, RouteContractOf } from "./route";

type ContractEntry = AnyRouteRef | AnyModuleRef;

type ContractEntries = Readonly<Record<string, ContractEntry>>;

type PublicModuleRoutes<Module extends AnyModuleRef> =
  ModuleContractOf<Module>["routes"];

type ContractEntryOf<Entry extends ContractEntry> = Entry extends AnyRouteRef
  ? RouteContractOf<Entry>
  : Entry extends AnyModuleRef
    ? PublicModuleRoutes<Entry>
    : never;

declare const apiContractBrand: unique symbol;

export interface ApiContractRef<Entries extends ContractEntries> {
  readonly entries: Entries;

  readonly [apiContractBrand]: {
    readonly contract: {
      -readonly [Name in keyof Entries]: ContractEntryOf<Entries[Name]>;
    };
  };
}

export type ApiContractOf<Contract> =
  Contract extends ApiContractRef<infer Entries>
    ? {
        -readonly [Name in keyof Entries]: ContractEntryOf<Entries[Name]>;
      }
    : never;

export function defineContract<const Entries extends ContractEntries>(
  entries: Entries,
): ApiContractRef<Entries> {
  return {
    entries,
  } as ApiContractRef<Entries>;
}

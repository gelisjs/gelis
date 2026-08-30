import type { AnyModuleRef, ModulePublicContractOf } from "./module";

import type { AnyRouteRef, RouteContractOf } from "./route";

type ContractEntry = AnyRouteRef | AnyModuleRef;

type ContractEntries = Readonly<Record<string, ContractEntry>>;

type AnyPublicContract = Readonly<Record<string, unknown>>;

type ContractEntryOf<Entry extends ContractEntry> = Entry extends AnyRouteRef
  ? RouteContractOf<Entry>
  : Entry extends AnyModuleRef
    ? ModulePublicContractOf<Entry>
    : never;

type PublicContract<Entries extends ContractEntries> = {
  -readonly [Name in keyof Entries]: ContractEntryOf<Entries[Name]>;
};

declare const apiContractBrand: unique symbol;

interface ApiContractRefInternal<
  Entries extends ContractEntries,
  Contract extends AnyPublicContract,
> {
  readonly entries: Entries;

  readonly [apiContractBrand]: {
    readonly contract: Contract;
  };
}

export type ApiContractRef<Entries extends ContractEntries> =
  ApiContractRefInternal<Entries, PublicContract<Entries>>;

export type ApiContractOf<Contract> =
  Contract extends ApiContractRefInternal<ContractEntries, infer Public>
    ? Public
    : never;

export type AnyApiContractRef = ApiContractRefInternal<
  ContractEntries,
  AnyPublicContract
>;

export function defineContract<const Entries extends ContractEntries>(
  entries: Entries,
): ApiContractRef<Entries> {
  // The brand is type-only.
  // Runtime contracts keep only their entries.
  return {
    entries,
  } as unknown as ApiContractRef<Entries>;
}

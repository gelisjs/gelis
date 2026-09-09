# Gelis Ecosystem Roadmap Policy

**Status:** Accepted  
**Repository:** `gelisjs/gelis`  
**Scope:** Core framework and official Gelis ecosystem

## Purpose

Gelis is expected to evolve from one framework repository into a coordinated official ecosystem containing the core framework plus independently maintained packages such as `@gelis/*`.

Repository separation must not fragment product direction.

This document defines where roadmap authority lives after official packages are split into separate repositories.

## Central roadmap authority

The primary Gelis roadmap remains in the core repository:

```text
gelisjs/gelis
└── docs/development/roadmap.md
```

The core repository is the source of truth for ecosystem-level direction even when implementation is distributed across multiple repositories.

The central roadmap owns:

```text
framework-wide milestones
industrial-readiness targets
official ecosystem capability priorities
cross-package architecture dependencies
compatibility requirements
performance strategy
TypeScript scalability strategy
security baseline
portable/runtime-specific boundaries
release-readiness coordination
package maturity status
```

A capability moving to another repository does not remove it from the central roadmap.

Instead, the central roadmap records why the capability exists, its priority, its architectural relationship to Gelis, and its current maturity state.

## Package-local roadmaps

Every official package that becomes substantial enough to live in its own repository may maintain its own implementation roadmap.

For example:

```text
gelisjs/gelis
  central ecosystem roadmap

gelisjs/openapi
  @gelis/openapi implementation roadmap

gelisjs/client
  @gelis/client implementation roadmap

gelisjs/opentelemetry
  @gelis/opentelemetry implementation roadmap
```

A package-local roadmap owns details such as:

```text
package-specific architecture phases
implementation tasks
package-specific correctness gates
package-specific benchmarks
package-specific compatibility work
package-specific documentation work
package-specific release preparation
```

The central roadmap must not duplicate every implementation task from package repositories.

## Two-level roadmap model

The accepted model is:

```text
Gelis central roadmap
        │
        ├── core framework milestones
        │
        ├── ecosystem capability priorities
        │
        ├── compatibility / dependency ordering
        │
        └── package maturity summaries
                 │
                 ├── @gelis/openapi local roadmap
                 ├── @gelis/client local roadmap
                 ├── @gelis/jwt local roadmap
                 ├── @gelis/session local roadmap
                 └── other official package roadmaps
```

This makes the core roadmap an ecosystem map rather than a monolithic task list.

## What remains in the core roadmap after repository separation

A package milestone remains visible centrally at a compact level.

Example:

```text
Official Authentication Baseline
├── bearer utilities        COMPLETE
├── @gelis/jwt              ACTIVE
├── @gelis/session          PLANNED
└── OAuth/OIDC strategy     PLANNED
```

The central roadmap should link to the package repository or package-local roadmap when detailed implementation information is required.

It should not copy all package-level phases into the core repository.

## Cross-package dependencies

The central roadmap is authoritative when work in one repository depends on another repository.

Examples include:

```text
@gelis/openapi depends on stable contract serialization
@gelis/client depends on stable public contract projection
@gelis/session may depend on cookie primitives
@gelis/opentelemetry may depend on lifecycle and request-scope boundaries
```

Dependency ordering must therefore remain visible from one place.

This prevents independently maintained repositories from creating incompatible product plans.

## Capability placement and roadmap ownership

The capability-placement rule remains:

```text
A. core primitive
B. core subpath (`gelis/*`)
C. official ecosystem package (`@gelis/*`)
D. community / external integration
```

Roadmap ownership follows placement:

- core primitives and core subpaths are implemented and tracked in `gelisjs/gelis`;
- official packages remain represented in the central roadmap and gain detailed tracking in their own repositories;
- community integrations may be referenced by the ecosystem documentation when useful but are not part of the official implementation roadmap unless their status changes.

## Repository separation does not imply architectural independence

Separate repositories are primarily a packaging, dependency, ownership, and release boundary.

They do not mean every official package may invent unrelated conventions.

Official packages must continue to follow Gelis-wide requirements where applicable:

```text
predictable API design
TypeScript scalability
zero-unused or bounded-unused cost
portable/runtime boundary discipline
security requirements
benchmark discipline
compatibility policy
documentation quality
```

Shared architectural contracts must be coordinated from the central roadmap and architecture documents.

## Release policy across repositories

Repository separation does not change Gelis release authority.

No package release is implied by milestone completion, acceptance, merge, freeze, or roadmap status.

For every core or official-package release:

1. release gates must be completed;
2. the exact release checklist must be presented to the maintainer;
3. externally visible or irreversible actions must be identified;
4. the maintainer executes or explicitly authorizes the release action.

Automated or assistant-initiated publishing remains prohibited by the Gelis Industrial Readiness Strategy.

## Version coordination

Separate repositories may eventually use independent package versions when that provides a practical maintenance advantage.

However, versioning strategy must be decided deliberately before the first multi-repository official release.

The central roadmap must record compatibility requirements between official packages and supported Gelis core versions.

A future compatibility policy should define at minimum:

```text
supported core version ranges
peer dependency expectations
breaking-change coordination
pre-release compatibility
minimum supported runtime versions
minimum supported TypeScript versions
```

No independent versioning policy is frozen by this document yet.

## Migration rule when a package is extracted

When functionality currently developed inside `gelisjs/gelis` is moved into a dedicated repository:

1. preserve its ecosystem-level milestone in the central roadmap;
2. move detailed package implementation planning to the new repository;
3. add a link from the central roadmap to the package repository or local roadmap;
4. record compatibility/dependency requirements centrally;
5. avoid maintaining two duplicate detailed roadmaps.

## Accepted conclusion

The Gelis core repository remains the home of the **master ecosystem roadmap**.

Official package repositories own their **detailed implementation roadmaps**.

In short:

```text
core roadmap
= where Gelis as an ecosystem is going

package roadmap
= how one package gets there
```

This model remains valid as the number of official repositories grows and prevents product direction from becoming fragmented across the Gelis organization.

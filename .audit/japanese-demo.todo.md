# Japanese learning demo migration

- [x] `how` over the affected subsystem.
- [x] `architect` for parallel design exploration. skip: existing relational schema and requested SQL migration fix the design; no function boundary changes.
- [x] Write the throughput checkpoint as four todo items.
  - Blocking first steps. Schema and publishing rules checked before implementation.
  - Independent workstreams. n/a: one linked fixture migration.
  - Shared mutable state. Isolated worktree for implementation; parent integrates after completion.
  - Smallest safe decomposition. One owner keeps foreign keys and documentation consistent.
- [x] Delegate code-writing to a subagent using your configured feature model.
- [x] Verify on the matching surface. PGlite PostgreSQL 17.5 applied prior migrations plus fixture; FK, scoring, preservation and collision rollback checks passed.
- [x] Rebase into small, ordered commits. Stack follow-ups. skip: local requested change, no commits requested.
- [x] If the design is contested, `interrogate` before shipping. skip: no contested design.
- [x] Run Opening a PR. skip: no PR requested.

# rails_state_machine

A loan disbursement workflow in TypeScript, built as one state machine and
driven by one event log. It brings together three ideas from the rails track
in `../state-machines-ts`:

Anything I have yet to implement is marked as `TODO`.

## Layout

```
src/
  types.ts        every type the workflow uses (done)
  errors.ts       extended IllegalTransitionError; UnhandledEventError (done)
  machine.ts      1. generic engine: step
  loan.ts         2. loan transition table and queries, plus the guarded edges
  workflow.ts     3. composition: dispatch and runWorkflow
  scenarios.ts    4. event-log fixtures (one example included)
  harness.ts      5. invariants and result rows
  demo.ts         prints each scenario's trace and row (done)
  *.test.ts       the spec for 1 to 3
```

## Rules

- Illegal transitions throw an error.
  - `new IllegalTransitionError(from, event,
    region, reason)` carries all four. `region` defaults to `'loan'` and
    `reason` (`no_transition` or `guard_failed`) to `'no_transition'`. No silent no-ops.
- Effects are data.
  - Edges return `send`, `post_ledger`, `notify_borrower`, and `raise_exception`.
    Nothing here moves money.
- The ledger balances. Every `post_ledger` sums to zero, and every entry
  carries the id of the event that caused it.
- The borrower status never lies. After a return it says "returned",
  never "delivered".
- Time arrives on events. `minutesSinceMidnightET` is minutes since midnight,
  America/New_York. No `Date.now()`.
  - Every move is logged. Each region that changes writes one `RegionTransition`.

## Commands

```sh
bun test                       # fails TODO until I've written that code
bun test src/loan.test.ts      # test one file
bun run typecheck
bun run demo                   # trace and result row for every demo scenario
bun run demo happy-rtp-closed  # run the "happy path RTP closed" scenario
```

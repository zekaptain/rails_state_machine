# rails_state_machine

A loan disbursement workflow in TypeScript, built as one state machine and
driven by one event log. This is designed as an example repo to help me conceptualize state machines. No actual money gets moved.
Do not treat as production code.

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

- If a transition isn't allowed, we throw `IllegalTransitionError(from, event, region, reason)` instead of silently doing nothing. `region` defaults to `'loan'`, and `reason` is `'no_transition'` or `'guard_failed'`.
- Transitions return effects as data: `send`, `post_ledger`, `notify_borrower`, and `raise_exception`.
- Each `post_ledger` must sum to zero. Every entry includes the ID of the event that caused it.
- After a return, the borrower status must say "returned", not "delivered".
- Use the time on the event, not `Date.now()`. `minutesSinceMidnightET` is the number of minutes since midnight in `America/New_York`.
- Log every state change. Each region that changes writes a single `RegionTransition`.

## Commands

```sh
bun test                       # fails TODO until I've written that code
bun test src/loan.test.ts      # test one file
bun run typecheck
bun run demo                   # trace and result row for every demo scenario
bun run demo happy-rtp-closed  # run the "happy path RTP closed" scenario
```

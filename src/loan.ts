/**
 * The loan lifecycle. Loan transitions table and its queries come first,
 * then the guarded edges that `step` runs. README §2.
 */
import { IllegalTransitionError } from './errors';
import type { Edge, LoanContext, LoanEvent, LoanInput, LoanState, Rail, TransitionRecord, TransitionTable } from './types';

/** Loan transitions table: the plain edges of the lifecycle. Terminal states get `{}`. */
export const LOAN_TRANSITIONS: TransitionTable = {
  applied: {
    approve: 'approved',
    decline: 'declined',
    cancel: 'cancelled',
  },
  approved: {
    disburse: 'disbursing',
    cancel: 'cancelled',
  },
  disbursing: {
    rail_settled: 'funded',
    rail_rejected: 'approved',
  },
  funded: {
    rail_returned: 'funded_pending_recovery',
    schedule_started: 'repaying',
  },
  funded_pending_recovery: {
    redisburse: 'disbursing',
    cancel: 'cancelled',
  },
  repaying: {
    paid_in_full: 'paid_off',
    missed_payment: 'delinquent'
  },
  delinquent: {
    payment_received: 'repaying',
    charge_off: 'defaulted',
  },
  paid_off: {
    release_collateral: 'closed',
    liquidate_collateral: 'closed',
  },
  defaulted: {
    liquidate_collateral: 'closed',
  },
  needs_review: {
    update_destination: 'approved',
    cancel: 'cancelled',
  },
  declined: {},
  cancelled: {},
  closed: {},
};

/** Return the next state, or throw IllegalTransitionError. */
export function transition(state: LoanState, event: LoanEvent, table: TransitionTable = LOAN_TRANSITIONS): LoanState {
  // index table by state, then by event to get next state
  const nextState = table[state][event];
  if (nextState === undefined) throw new IllegalTransitionError(state, event);
  return nextState;
}

export function canTransition(state: LoanState, event: LoanEvent, table: TransitionTable = LOAN_TRANSITIONS): boolean {
  const nextState = table[state][event];
  if (nextState === undefined) return false;
  return true;
}

/** Fold the events over the table. Log every transition. Stop at the first illegal one by throwing. */
export function replay(
  initial: LoanState,
  events: readonly LoanEvent[],
  table: TransitionTable = LOAN_TRANSITIONS,
): { state: LoanState; log: TransitionRecord[] } {
  let state = initial;
  const log: TransitionRecord[] = [];
  for (const event of events) {
    if (!canTransition(state, event, table)) throw new IllegalTransitionError(state, event);
    const nextState = transition(state, event, table);
    log.push({ from: state, event, to: nextState });
    state = nextState;
  }
  return { state, log };
}

/** I got sick of casting the Object.keys() to `LoanState` */
export function stateKeys(table: TransitionTable): LoanState[] {
  return Object.keys(table) as LoanState[];
}

// Oh this is even simpler than above
export function typedEntries<K extends PropertyKey, V>(obj: Partial<Record<K, V>>): [K, V][] {
  return Object.entries(obj) as [K, V][];
}

/** States with no outgoing edges. Derived from the table. */
export function terminalStates(table: TransitionTable = LOAN_TRANSITIONS): Set<LoanState> {
  const terminal = new Set<LoanState>();
  for (const [state, row] of typedEntries(table)) {
    // state: LoanState
    // row: Readonly<Partial<Record<LoanEvent, LoanState>>>
    if (Object.keys(row).length === 0) terminal.add(state);
  }
  return terminal;
}

/** Every state reachable from `from` (inclusive). BFS over the table.
 *  I chose BFS because it's easier to conceptualize the implementation.
 */
export function reachable(from: LoanState, table: TransitionTable = LOAN_TRANSITIONS): Set<LoanState> {
  const seen = new Set<LoanState>([from]);
  const queue: LoanState[] = [from];
  let state = queue.shift();
  while (state !== undefined) {
    for (const [, next] of typedEntries(table[state])) {
			if (!seen.has(next)) {
				seen.add(next);
				queue.push(next);
      }
    }
    // move to next state at end of while loop
    state = queue.shift();
  }
  return seen;
}

/** `disb:<loanId>:<attempt>`. README §2. */
export function idempotencyKey(loanId: string, attempt: number): string {
  throw new Error('TODO: idempotencyKey');
}

/** Routing policy. `at` is minutes since midnight ET. README §2. */
export function chooseRail(ctx: LoanContext, at: number): Rail | null {
  throw new Error('TODO: chooseRail');
}

/** Loan transition table as plain edges: no guard, no action. */
export function edgesFrom(table: TransitionTable): Edge<LoanState, LoanContext, LoanInput>[] {
  throw new Error('TODO: edgesFrom');
}

/**
 * What `step` runs: the hand-written edges from README §2 first, so they win,
 * then edgesFrom(LOAN_TRANSITIONS).
 */
export const LOAN_EDGES: readonly Edge<LoanState, LoanContext, LoanInput>[] = [
  // TODO
];

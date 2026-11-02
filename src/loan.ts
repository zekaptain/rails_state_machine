/**
 * The loan lifecycle. Loan transitions table and its queries come first,
 * then the guarded edges that `step` runs. README §2.
 */
import { IllegalTransitionError } from './errors';
import type { Edge, LoanContext, LoanEventPayload, LoanEventType, LoanState, LoanTransition, LoanTransitionTable, Rail } from './types';

/** Loan transitions table: the plain edges of the lifecycle. Terminal states get `{}`. */
export const LOAN_TRANSITIONS: LoanTransitionTable = {
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
export function transition(state: LoanState, event: LoanEventType, table: LoanTransitionTable = LOAN_TRANSITIONS): LoanState {
  // index table by state, then by event to get next state
  const nextState = table[state][event];
  if (nextState === undefined) throw new IllegalTransitionError(state, event);
  return nextState;
}

export function canTransition(state: LoanState, event: LoanEventType, table: LoanTransitionTable = LOAN_TRANSITIONS): boolean {
  const nextState = table[state][event];
  if (nextState === undefined) return false;
  return true;
}

/** Fold the events over the table. Log every transition. Stop at the first illegal one by throwing. */
export function replay(
  initial: LoanState,
  events: readonly LoanEventType[],
  table: LoanTransitionTable = LOAN_TRANSITIONS,
): { state: LoanState; log: LoanTransition[] } {
  let state = initial;
  const log: LoanTransition[] = [];
  for (const event of events) {
    if (!canTransition(state, event, table)) throw new IllegalTransitionError(state, event);
    const nextState = transition(state, event, table);
    log.push({ from: state, event, to: nextState });
    state = nextState;
  }
  return { state, log };
}

/** The states in `table`, typed as `LoanState` instead of `string`. */
export function statesOf(table: LoanTransitionTable): LoanState[] {
  return Object.keys(table) as LoanState[];
}

/** `Object.entries` with the key and value types preserved. */
export function typedEntries<K extends PropertyKey, V>(obj: Partial<Record<K, V>>): [K, V][] {
  return Object.entries(obj) as [K, V][];
}

/** States with no outgoing edges. Derived from the table. */
export function terminalStates(table: LoanTransitionTable = LOAN_TRANSITIONS): Set<LoanState> {
  const terminal = new Set<LoanState>();
  for (const [state, nextStateByEvent] of typedEntries(table)) {
    // state: LoanState
    // nextStateByEvent: Readonly<Partial<Record<LoanEventType, LoanState>>>
    if (Object.keys(nextStateByEvent).length === 0) terminal.add(state);
  }
  return terminal;
}

/** Every state reachable from `from` (inclusive). BFS over the table.
 *  I chose BFS because it's easier to conceptualize the implementation.
 */
export function reachableStates(from: LoanState, table: LoanTransitionTable = LOAN_TRANSITIONS): Set<LoanState> {
  const visited = new Set<LoanState>([from]);
  const queue: LoanState[] = [from];
  let current = queue.shift();
  while (current !== undefined) {
    for (const [, nextState] of typedEntries(table[current])) {
			if (!visited.has(nextState)) {
				visited.add(nextState);
				queue.push(nextState);
      }
    }
    // move to next state at end of while loop
    current = queue.shift();
  }
  return visited;
}

/** `disb:<loanId>:<attemptNumber>`. README §2. */
export function disbursementIdempotencyKey(loanId: string, attemptNumber: number): string {
  throw new Error('TODO: disbursementIdempotencyKey');
}

/** Routing policy. README §2. */
export function chooseRail(context: LoanContext, minutesSinceMidnightET: number): Rail | null {
  throw new Error('TODO: chooseRail');
}

/** Loan transition table as plain edges: no guard, no action. */
export function edgesFromTable(table: LoanTransitionTable): Edge<LoanState, LoanContext, LoanEventPayload>[] {
  throw new Error('TODO: edgesFromTable');
}

/**
 * What `step` runs: the hand-written edges from README §2 first, so they win,
 * then edgesFromTable(LOAN_TRANSITIONS).
 */
export const LOAN_EDGES: readonly Edge<LoanState, LoanContext, LoanEventPayload>[] = [
  // TODO
];

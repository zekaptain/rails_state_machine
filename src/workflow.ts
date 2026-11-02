import type {
  Attempt,
  AttemptEvent,
  AttemptPhase,
  CollateralEvent,
  CollateralState,
  DispatchResult,
  Edge,
  LoanContext,
  WorkflowEvent,
  WorkflowSnapshot,
} from './types';

/** The child machine that runs inside `disbursing`. README §3. */
export const ATTEMPT_EDGES: readonly Edge<AttemptPhase, Attempt, AttemptEvent>[] = [
  // TODO
];

/** The collateral region. Its context is the whole snapshot, so guards can read the loan region. README §3. */
export const COLLATERAL_EDGES: readonly Edge<CollateralState, WorkflowSnapshot, CollateralEvent>[] = [
  // TODO
];

export function initialSnapshot(context: LoanContext): WorkflowSnapshot {
  throw new Error('TODO: initialSnapshot');
}

/** Route one log event to its region. README §3. */
export function dispatch(snapshot: WorkflowSnapshot, event: WorkflowEvent): DispatchResult {
  throw new Error('TODO: dispatch');
}

/** Fold `dispatch` over the log. Throws on the first illegal event. */
export function runWorkflow(events: readonly WorkflowEvent[], startSnapshot: WorkflowSnapshot): DispatchResult {
  throw new Error('TODO: runWorkflow');
}

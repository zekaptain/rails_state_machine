import type { Edge, StepResult } from './types';

/** Fire the first eligible edge from `state` on `event.type`.
 *
 * Generic guarded step.
 *  - No transition with matching (from, eventType): rejected / no_transition.
 *  - Candidates exist but every guard fails: rejected / guard_failed.
 *  - Otherwise the first candidate whose guard passes (or has no guard) fires.
 *    Run its action (if any) and return the new state, context, and effects.
 */
export function step<TState extends string, TContext, TEvent extends { type: string }>(
  edges: readonly Edge<TState, TContext, TEvent>[],
  state: TState,
  context: TContext,
  event: TEvent,
): StepResult<TState, TContext> {

  throw new Error('TODO: step');
}

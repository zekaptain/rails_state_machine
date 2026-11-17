import type { Edge, StepResult } from './types';

/** Fire the first eligible edge from `state` on `event.type`.
 *
 * Generic guarded step.
 *  - No transition with matching (from, eventType): rejected / no_transition.
 *  - Candidates exist but every guard fails: rejected / guard_failed.
 *  - Otherwise the first candidate whose guard passes (or has no guard) fires.
 *    Run its action (if any) and return the new state, context, and effects.
 *
 */
export function step<TState extends string, TContext, TEvent extends { type: string }>(
  edges: readonly Edge<TState, TContext, TEvent>[],
  state: TState,
  context: TContext,
  event: TEvent,
): StepResult<TState, TContext> {
  // find all candidates
  const candidates = edges.filter(
    edge => edge.from === state && edge.eventType === event.type
  );
  if (candidates.length === 0) return { kind: 'rejected', reason: 'no_transition', state, context };
  // return rejected if none
  // select candidate
  const selected = candidates.find(
    edge => !edge.guard || edge.guard(context, event)
  );

  // if found candidates failed their guard (selected edge is undefined):
  if (selected === undefined) return { kind: 'rejected', reason: 'guard_failed', state, context };

  // if found candidate passes guard, grab the selected edge's action
  const result = selected.action
    ? selected.action(context, event)
    : { context, effects: [] };

	// we return the final result as 'ok'
  return { kind: 'ok', state: selected.to, context: result.context, effects: result.effects };
}

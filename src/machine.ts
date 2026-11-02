import type { Edge, StepResult } from './types';

/** Fire the first eligible edge from `state` on `event.type`.
 *
 * Generic guarded step.
 *  - No transition with matching (from, on): rejected / no_transition.
 *  - Candidates exist but every guard fails: rejected / guard_failed.
 *  - Otherwise the first candidate whose guard passes (or has no guard) fires.
 *    Run its action (if any) and return the new state, ctx, and effects.
 */
export function step<S extends string, C, E extends { type: string }>(
  edges: readonly Edge<S, C, E>[],
  state: S,
  ctx: C,
  event: E,
): StepResult<S, C> {

  throw new Error('TODO: step');
}

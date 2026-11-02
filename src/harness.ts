import type { Effect, RegionTransition, ResultRow, Scenario, WorkflowSnapshot } from './types';

/** Names of the invariants that fail right now. Call after every event. README §4. */
export function findViolatedInvariants(snapshot: WorkflowSnapshot, effects: readonly Effect[]): string[] {
  throw new Error('TODO: findViolatedInvariants');
}

/** Play one scenario event by event and score it. README §4. */
export function runScenario(scenario: Scenario): { trace: RegionTransition[]; effects: Effect[]; row: ResultRow } {
  throw new Error('TODO: runScenario');
}

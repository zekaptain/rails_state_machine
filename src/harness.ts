import type { Effect, RegionLog, ResultRow, Scenario, Snapshot } from './types';

/** Names of the invariants that fail right now. Call after every event. README §4. */
export function checkInvariants(snapshot: Snapshot, effects: readonly Effect[]): string[] {
  throw new Error('TODO: checkInvariants');
}

/** Play one scenario event by event and score it. README §4. */
export function runScenario(scenario: Scenario): { trace: RegionLog[]; effects: Effect[]; row: ResultRow } {
  throw new Error('TODO: runScenario');
}

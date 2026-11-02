import { describe, expect, it } from 'bun:test';
import { step } from './machine';
import type { Edge } from './types';

// A toy door, so the engine is tested without the loan domain.
type Door = 'locked' | 'unlocked' | 'open' | 'broken';
interface DoorEvent {
  type: 'unlock' | 'open' | 'kick';
  code?: string;
}
interface DoorContext {
  code: string;
  kicks: number;
}

const DOOR: readonly Edge<Door, DoorContext, DoorEvent>[] = [
  { from: 'locked', eventType: 'unlock', to: 'unlocked', guard: (context, event) => event.code === context.code },
  { from: 'locked', eventType: 'kick', to: 'broken', guard: (context) => context.kicks >= 2 },
  { from: 'locked', eventType: 'kick', to: 'locked', action: (context) => ({ context: { ...context, kicks: context.kicks + 1 }, effects: [] }) },
  { from: 'unlocked', eventType: 'open', to: 'open', action: (context) => ({ context, effects: [{ type: 'notify_borrower', message: 'door open' }] }) },
];
const context: DoorContext = { code: '1234', kicks: 0 };

describe('machine: guarded steps over an edge list', () => {
  it('fires the matching edge and returns its effects', () => {
    expect(step(DOOR, 'locked', context, { type: 'unlock', code: '1234' })).toEqual({ kind: 'ok', state: 'unlocked', context, effects: [] });
    expect(step(DOOR, 'unlocked', context, { type: 'open' })).toEqual({
      kind: 'ok',
      state: 'open',
      context,
      effects: [{ type: 'notify_borrower', message: 'door open' }],
    });
  });

  it('tries edges in order: the first passing guard wins, an unguarded edge is the else branch', () => {
    expect(step(DOOR, 'locked', context, { type: 'kick' })).toEqual({ kind: 'ok', state: 'locked', context: { code: '1234', kicks: 1 }, effects: [] });
    expect(step(DOOR, 'locked', { ...context, kicks: 2 }, { type: 'kick' })).toMatchObject({ kind: 'ok', state: 'broken' });
  });

  it('says which kind of no: no_transition vs guard_failed', () => {
    expect(step(DOOR, 'locked', context, { type: 'open' })).toEqual({ kind: 'rejected', reason: 'no_transition', state: 'locked', context });
    expect(step(DOOR, 'locked', context, { type: 'unlock', code: '0000' })).toEqual({ kind: 'rejected', reason: 'guard_failed', state: 'locked', context });
  });
});

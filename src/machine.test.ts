import { describe, expect, it } from 'bun:test';
import { step } from './machine';
import type { Edge } from './types';

// A toy door, so the engine is tested without the loan domain.
type Door = 'locked' | 'unlocked' | 'open' | 'broken';
interface DoorEvent {
  type: 'unlock' | 'open' | 'kick';
  code?: string;
}
interface DoorCtx {
  code: string;
  kicks: number;
}

const DOOR: readonly Edge<Door, DoorCtx, DoorEvent>[] = [
  { from: 'locked', on: 'unlock', to: 'unlocked', guard: (c, e) => e.code === c.code },
  { from: 'locked', on: 'kick', to: 'broken', guard: (c) => c.kicks >= 2 },
  { from: 'locked', on: 'kick', to: 'locked', action: (c) => ({ ctx: { ...c, kicks: c.kicks + 1 }, effects: [] }) },
  { from: 'unlocked', on: 'open', to: 'open', action: (c) => ({ ctx: c, effects: [{ type: 'notify_borrower', message: 'door open' }] }) },
];
const ctx: DoorCtx = { code: '1234', kicks: 0 };

describe('machine: guarded steps over an edge list', () => {
  it('fires the matching edge and returns its effects', () => {
    expect(step(DOOR, 'locked', ctx, { type: 'unlock', code: '1234' })).toEqual({ kind: 'ok', state: 'unlocked', ctx, effects: [] });
    expect(step(DOOR, 'unlocked', ctx, { type: 'open' })).toEqual({
      kind: 'ok',
      state: 'open',
      ctx,
      effects: [{ type: 'notify_borrower', message: 'door open' }],
    });
  });

  it('tries edges in order: the first passing guard wins, an unguarded edge is the else branch', () => {
    expect(step(DOOR, 'locked', ctx, { type: 'kick' })).toEqual({ kind: 'ok', state: 'locked', ctx: { code: '1234', kicks: 1 }, effects: [] });
    expect(step(DOOR, 'locked', { ...ctx, kicks: 2 }, { type: 'kick' })).toMatchObject({ kind: 'ok', state: 'broken' });
  });

  it('says which kind of no: no_transition vs guard_failed', () => {
    expect(step(DOOR, 'locked', ctx, { type: 'open' })).toEqual({ kind: 'rejected', reason: 'no_transition', state: 'locked', ctx });
    expect(step(DOOR, 'locked', ctx, { type: 'unlock', code: '0000' })).toEqual({ kind: 'rejected', reason: 'guard_failed', state: 'locked', ctx });
  });
});

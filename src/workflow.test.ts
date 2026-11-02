import { describe, expect, it } from 'bun:test';
import { IllegalTransitionError, UnhandledEventError } from './errors';
import { dispatch, initialSnapshot, run } from './workflow';
import type { CollateralEvent, LoanContext, LoanEvent, RailOutcome, Snapshot, WorkflowEvent } from './types';

const CTX: LoanContext = {
  loanId: 'ln_001',
  borrowerId: 'b_001',
  principalCents: 50_000,
  attempt: 0,
  maxAttempts: 3,
  destination: { railSupport: ['rtp', 'ach'], accountState: 'open' },
};
const ACH_ONLY: LoanContext = { ...CTX, destination: { railSupport: ['ach'], accountState: 'open' } };

const loan = (id: string, command: LoanEvent): WorkflowEvent => ({ source: 'loan', id, at: 600, command });
const rail = (id: string, outcome: RailOutcome, code?: string): WorkflowEvent => ({ source: 'rail', id, at: 600, outcome, code });
const collateral = (id: string, action: CollateralEvent['type']): WorkflowEvent => ({ source: 'collateral', id, at: 600, action });

const after = (ctx: LoanContext, events: WorkflowEvent[]): Snapshot => run(events, initialSnapshot(ctx)).snapshot;
const thrown = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected a throw');
};

const DISBURSING = [loan('e1', 'approve'), loan('e2', 'disburse')];
const FUNDED = [...DISBURSING, rail('e3', 'accepted'), rail('e4', 'settled')];

describe('workflow: loan contains attempt, alongside collateral', () => {
  it('disburse spawns an attempt; its settle bubbles up to the loan and the attempt exits', () => {
    const s = after(CTX, DISBURSING);
    expect(s.loan).toBe('disbursing');
    expect(s.attempt).toEqual({ id: 1, phase: 'sending', rail: 'rtp', key: 'disb:ln_001:1' });
    const r = dispatch(s, rail('e3', 'settled'));
    expect(r.snapshot.loan).toBe('funded');
    expect(r.snapshot.attempt).toBeNull();
    expect(r.log).toEqual([
      { region: 'attempt', from: 'sending', to: 'settled', cause: 'e3' },
      { region: 'loan', from: 'disbursing', to: 'funded', cause: 'e3' },
    ]);
  });

  it('events that only a region may raise cannot be injected from outside', () => {
    const s = after(CTX, DISBURSING);
    for (const command of ['rail_settled', 'rail_rejected', 'release_collateral'] as const) {
      expect(() => dispatch(s, loan('x', command))).toThrow(UnhandledEventError);
    }
    // Nothing is in flight to receive a settle.
    expect(() => dispatch(after(CTX, [loan('e1', 'approve')]), rail('x', 'settled'))).toThrow(UnhandledEventError);
  });

  it('illegal commands throw with region, from, event, and reason', () => {
    const s = after(CTX, DISBURSING);
    const err = thrown(() => dispatch(s, loan('x', 'cancel')));
    expect(err).toBeInstanceOf(IllegalTransitionError);
    expect(err).toMatchObject({ region: 'loan', from: 'disbursing', event: 'cancel', reason: 'no_transition' });
  });

  it('a late ACH return after settle nets the ledger to zero and never says delivered', () => {
    const { snapshot, effects } = run([...FUNDED, rail('e5', 'returned', 'R01')], initialSnapshot(ACH_ONLY));
    expect(snapshot.loan).toBe('funded_pending_recovery');
    const pool = effects.flatMap((e) => (e.type === 'post_ledger' ? e.entries : [])).filter((e) => e.account === 'funding_pool');
    expect(pool.reduce((sum, e) => sum + e.deltaCents, 0)).toBe(0);
    const lastNotice = effects.filter((e) => e.type === 'notify_borrower').at(-1);
    expect(lastNotice).toMatchObject({ message: expect.stringMatching(/returned/i) });
    expect(JSON.stringify(lastNotice)).not.toMatch(/delivered/i);
  });

  it('collateral release is guarded by the sibling loan region, and closes the loan', () => {
    const repaying = after(CTX, [...FUNDED, loan('e5', 'schedule_started')]);
    expect(thrown(() => dispatch(repaying, collateral('x', 'release')))).toMatchObject({ region: 'collateral', reason: 'guard_failed' });
    const paidOff = dispatch(repaying, loan('e6', 'paid_in_full')).snapshot;
    const r = dispatch(paidOff, collateral('e7', 'release'));
    expect(r.snapshot).toMatchObject({ loan: 'closed', collateral: 'released' });
    expect(r.log.map((l) => l.region)).toEqual(['collateral', 'loan']);
  });
});

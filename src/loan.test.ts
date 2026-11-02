import { describe, expect, it } from 'bun:test';
import { IllegalTransitionError } from './errors';
import {
  LOAN_EDGES,
  LOAN_TRANSITIONS,
  canTransition,
  chooseRail,
  edgesFrom,
  idempotencyKey,
  reachable,
  replay,
  terminalStates,
  transition,
  typedEntries,
} from './loan';
import { step } from './machine';
import type { Effect, LoanContext, LoanEvent, LoanInput, LoanState, Rail } from './types';

describe('loan lifecycle transition table', () => {
  it('encodes the happy path: applied -> approved -> disbursing -> funded -> repaying -> paid_off -> closed', () => {
    const { state, log } = replay('applied', [
      'approve',
      'disburse',
      'rail_settled',
      'schedule_started',
      'paid_in_full',
      'release_collateral',
    ]);
    expect(state).toBe('closed');
    expect(log.map((r) => r.to)).toEqual(['approved', 'disbursing', 'funded', 'repaying', 'paid_off', 'closed']);
  });

  it('models the late ACH return: funded -> funded_pending_recovery -> disbursing -> funded', () => {
    const { state } = replay('funded', ['rail_returned', 'redisburse', 'rail_settled']);
    expect(state).toBe('funded');
  });

  it('models a synchronous rail rejection as a bounce back to approved', () => {
    expect(transition('disbursing', 'rail_rejected')).toBe('approved');
  });

  it('models delinquency and charge-off', () => {
    const { state } = replay('repaying', ['missed_payment', 'charge_off', 'liquidate_collateral']);
    expect(state).toBe('closed');
    expect(transition('delinquent', 'payment_received')).toBe('repaying');
  });

  it('rejects illegal transitions loudly, with from/event attached', () => {
    const illegal: Array<[LoanState, LoanEvent]> = [
      ['disbursing', 'cancel'], // money in flight
      ['disbursing', 'rail_returned'], // a return can only follow a settle
      ['approved', 'rail_settled'], // nothing was sent
      ['funded', 'disburse'], // double disbursement
      ['closed', 'approve'],
      ['declined', 'disburse'],
    ];
    for (const [from, event] of illegal) {
      expect(canTransition(from, event)).toBe(false);
      try {
        transition(from, event);
        expect.unreachable(`expected ${from} on ${event} to throw`);
      } catch (e) {
        expect(e).toBeInstanceOf(IllegalTransitionError);
        const err = e as IllegalTransitionError;
        expect(err.from).toBe(from);
        expect(err.event).toBe(event);
      }
    }
  });

  it('replay throws on the first illegal event and does not silently skip it', () => {
    expect(() => replay('applied', ['approve', 'rail_settled', 'disburse'])).toThrow(IllegalTransitionError);
  });

  it('derives terminal states from the table instead of hardcoding them', () => {
    expect(terminalStates()).toEqual(new Set(['declined', 'cancelled', 'closed']));
    const tiny = { ...LOAN_TRANSITIONS, closed: { approve: 'applied' } } as typeof LOAN_TRANSITIONS;
    expect(terminalStates(tiny)).toEqual(new Set(['declined', 'cancelled']));
  });

  it('answers reachability questions by walking the graph', () => {
    expect(reachable('funded')).not.toContain('declined');
    expect(reachable('funded')).not.toContain('applied');
    expect(reachable('funded')).toContain('closed');
    expect(reachable('funded')).toContain('cancelled'); // via funded_pending_recovery
    expect(reachable('closed')).toEqual(new Set(['closed']));
    expect(reachable('applied').size).toBe(12);
  });

  it('every state in the type appears in the table (closed world)', () => {
    const states: LoanState[] = [
      'applied', 'approved', 'declined', 'disbursing', 'funded', 'funded_pending_recovery',
      'repaying', 'delinquent', 'paid_off', 'defaulted', 'cancelled', 'closed',
    ];
    for (const s of states) expect(LOAN_TRANSITIONS).toHaveProperty(s);
    for (const row of Object.values(LOAN_TRANSITIONS)) {
      for (const to of Object.values(row)) expect(states).toContain(to);
    }
  });
});

// Challenge 02 on top of the table.
const ctx = (over: Partial<LoanContext> = {}): LoanContext => ({
  loanId: 'ln_001',
  borrowerId: 'b_001',
  principalCents: 50_000,
  attempt: 0,
  maxAttempts: 3,
  destination: { railSupport: ['rtp', 'ach'], accountState: 'open' },
  ...over,
});
const input = (type: LoanEvent, over: Partial<LoanInput> = {}): LoanInput => ({ type, id: `ev_${type}`, at: 10 * 60, ...over });
const open = (railSupport: Rail[]) => ({ railSupport, accountState: 'open' as const });

const fire = (state: LoanState, c: LoanContext, e: LoanInput) => {
  const r = step(LOAN_EDGES, state, c, e);
  if (r.kind !== 'ok') throw new Error(`expected ${state} --${e.type}--> to fire, got ${r.reason}`);
  return r;
};
const ofType = <T extends Effect['type']>(effects: Effect[], type: T) =>
  effects.filter((e): e is Extract<Effect, { type: T }> => e.type === type);

describe('loan: guarded edges on top of the table', () => {
  it('turns loan transitions table into plain edges', () => {
    const edges = edgesFrom(LOAN_TRANSITIONS);
    const rows = typedEntries(LOAN_TRANSITIONS).flatMap(([, row]) => typedEntries(row));
    expect(edges).toHaveLength(rows.length);
    expect(edges).toContainEqual({ from: 'applied', on: 'approve', to: 'approved' });
    expect(edges.every((e) => e.guard === undefined && e.action === undefined)).toBe(true);
  });

  it('routes RTP > ACH > wire before 16:00, and never ACH after a return', () => {
    expect(chooseRail(ctx(), 600)).toBe('rtp');
    expect(chooseRail(ctx({ destination: open(['ach']) }), 600)).toBe('ach');
    expect(chooseRail(ctx({ destination: open([]) }), 600)).toBe('wire');
    expect(chooseRail(ctx({ destination: open([]) }), 16 * 60)).toBeNull();
    expect(chooseRail(ctx({ destination: open(['ach']), lastReturnCode: 'R01' }), 600)).toBe('wire');
    expect(chooseRail(ctx({ destination: { railSupport: ['rtp'], accountState: 'frozen' } }), 600)).toBeNull();
  });

  it('derives idempotency keys from (loan, attempt)', () => {
    expect(idempotencyKey('ln_001', 1)).toBe('disb:ln_001:1');
    expect(idempotencyKey('ln_001', 2)).not.toBe(idempotencyKey('ln_001', 1));
  });

  it('disburse sends once, posts a balanced pair, and records the attempt', () => {
    const r = fire('approved', ctx(), input('disburse'));
    expect(r.state).toBe('disbursing');
    expect(r.ctx).toMatchObject({ attempt: 1, lastRail: 'rtp' });
    expect(ofType(r.effects, 'send')).toEqual([{ type: 'send', rail: 'rtp', idempotencyKey: 'disb:ln_001:1', amountCents: 50_000 }]);
    const entries = ofType(r.effects, 'post_ledger').flatMap((p) => p.entries);
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        { account: 'funding_pool', deltaCents: -50_000, reason: 'disbursement', eventId: 'ev_disburse' },
        { account: 'borrower_payable_b_001', deltaCents: 50_000, reason: 'disbursement', eventId: 'ev_disburse' },
      ]),
    );
    expect(ofType(r.effects, 'notify_borrower')).toHaveLength(1);
  });

  it('with no eligible rail, disburse falls back to needs_review and no money moves', () => {
    const r = fire('approved', ctx({ destination: { railSupport: ['ach'], accountState: 'frozen' } }), input('disburse'));
    expect(r.state).toBe('needs_review');
    expect(ofType(r.effects, 'raise_exception').map((e) => e.class)).toEqual(['no_eligible_rail']);
    expect(ofType(r.effects, 'send')).toEqual([]);
    expect(ofType(r.effects, 'post_ledger')).toEqual([]);
  });

  it('a late return reverses the ledger, raises an exception, and tells the truth', () => {
    const r = fire('funded', ctx({ attempt: 1, lastRail: 'ach' }), input('rail_returned', { code: 'R01' }));
    expect(r.state).toBe('funded_pending_recovery');
    expect(r.ctx.lastReturnCode).toBe('R01');
    const entries = ofType(r.effects, 'post_ledger').flatMap((p) => p.entries);
    expect(entries.reduce((sum, e) => sum + e.deltaCents, 0)).toBe(0);
    expect(entries).toContainEqual({ account: 'funding_pool', deltaCents: 50_000, reason: 'ach_return_R01', eventId: 'ev_rail_returned' });
    expect(ofType(r.effects, 'raise_exception').map((e) => e.class)).toEqual(['ach_return_after_settled']);
    const [notice] = ofType(r.effects, 'notify_borrower');
    expect(notice?.message).toMatch(/returned/i);
    expect(notice?.message).not.toMatch(/delivered/i);
  });
});

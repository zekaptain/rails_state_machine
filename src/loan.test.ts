import { describe, expect, it } from 'bun:test';
import { IllegalTransitionError } from './errors';
import {
  LOAN_EDGES,
  LOAN_TRANSITIONS,
  canTransition,
  chooseRail,
  disbursementIdempotencyKey,
  edgesFromTable,
  reachableStates,
  replay,
  terminalStates,
  transition,
  typedEntries,
} from './loan';
import { step } from './machine';
import type { Effect, LoanContext, LoanEventPayload, LoanEventType, LoanState, Rail } from './types';

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
    expect(log.map((entry) => entry.to)).toEqual(['approved', 'disbursing', 'funded', 'repaying', 'paid_off', 'closed']);
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
    const illegal: Array<[LoanState, LoanEventType]> = [
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
    expect(reachableStates('funded')).not.toContain('declined');
    expect(reachableStates('funded')).not.toContain('applied');
    expect(reachableStates('funded')).toContain('closed');
    expect(reachableStates('funded')).toContain('cancelled'); // via funded_pending_recovery
    expect(reachableStates('closed')).toEqual(new Set(['closed']));
    expect(reachableStates('applied').size).toBe(12);
  });

  it('every state in the type appears in the table (closed world)', () => {
    const states: LoanState[] = [
      'applied', 'approved', 'declined', 'disbursing', 'funded', 'funded_pending_recovery',
      'repaying', 'delinquent', 'paid_off', 'defaulted', 'cancelled', 'closed',
    ];
    for (const state of states) expect(LOAN_TRANSITIONS).toHaveProperty(state);
    for (const nextStateByEvent of Object.values(LOAN_TRANSITIONS)) {
      for (const to of Object.values(nextStateByEvent)) expect(states).toContain(to);
    }
  });
});

// Challenge 02 on top of the table.
const loanContext = (overrides: Partial<LoanContext> = {}): LoanContext => ({
  loanId: 'ln_001',
  borrowerId: 'b_001',
  principalCents: 50_000,
  attemptCount: 0,
  maxAttempts: 3,
  destination: { supportedRails: ['rtp', 'ach'], accountState: 'open' },
  ...overrides,
});
const payload = (type: LoanEventType, overrides: Partial<LoanEventPayload> = {}): LoanEventPayload => ({
  type,
  id: `ev_${type}`,
  minutesSinceMidnightET: 10 * 60,
  ...overrides,
});
const openAccount = (supportedRails: Rail[]) => ({ supportedRails, accountState: 'open' as const });

const fire = (state: LoanState, context: LoanContext, event: LoanEventPayload) => {
  const result = step(LOAN_EDGES, state, context, event);
  if (result.kind !== 'ok') throw new Error(`expected ${state} --${event.type}--> to fire, got ${result.reason}`);
  return result;
};
const ofType = <T extends Effect['type']>(effects: Effect[], type: T) =>
  effects.filter((effect): effect is Extract<Effect, { type: T }> => effect.type === type);

describe('loan: guarded edges on top of the table', () => {
  it('turns loan transitions table into plain edges', () => {
    const edges = edgesFromTable(LOAN_TRANSITIONS);
    const tableEntries = typedEntries(LOAN_TRANSITIONS).flatMap(([, nextStateByEvent]) => typedEntries(nextStateByEvent));
    expect(edges).toHaveLength(tableEntries.length);
    expect(edges).toContainEqual({ from: 'applied', eventType: 'approve', to: 'approved' });
    expect(edges.every((edge) => edge.guard === undefined && edge.action === undefined)).toBe(true);
  });

  it('routes RTP > ACH > wire before 16:00, and never ACH after a return', () => {
    expect(chooseRail(loanContext(), 600)).toBe('rtp');
    expect(chooseRail(loanContext({ destination: openAccount(['ach']) }), 600)).toBe('ach');
    expect(chooseRail(loanContext({ destination: openAccount([]) }), 600)).toBe('wire');
    expect(chooseRail(loanContext({ destination: openAccount([]) }), 16 * 60)).toBeNull();
    expect(chooseRail(loanContext({ destination: openAccount(['ach']), lastReturnCode: 'R01' }), 600)).toBe('wire');
    expect(chooseRail(loanContext({ destination: { supportedRails: ['rtp'], accountState: 'frozen' } }), 600)).toBeNull();
  });

  it('derives idempotency keys from (loan, attempt)', () => {
    expect(disbursementIdempotencyKey('ln_001', 1)).toBe('disb:ln_001:1');
    expect(disbursementIdempotencyKey('ln_001', 2)).not.toBe(disbursementIdempotencyKey('ln_001', 1));
  });

  it('disburse sends once, posts a balanced pair, and records the attempt', () => {
    const result = fire('approved', loanContext(), payload('disburse'));
    expect(result.state).toBe('disbursing');
    expect(result.context).toMatchObject({ attemptCount: 1, lastRail: 'rtp' });
    expect(ofType(result.effects, 'send')).toEqual([{ type: 'send', rail: 'rtp', idempotencyKey: 'disb:ln_001:1', amountCents: 50_000 }]);
    const entries = ofType(result.effects, 'post_ledger').flatMap((post) => post.entries);
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        { account: 'funding_pool', deltaCents: -50_000, reason: 'disbursement', eventId: 'ev_disburse' },
        { account: 'borrower_payable_b_001', deltaCents: 50_000, reason: 'disbursement', eventId: 'ev_disburse' },
      ]),
    );
    expect(ofType(result.effects, 'notify_borrower')).toHaveLength(1);
  });

  it('with no eligible rail, disburse falls back to needs_review and no money moves', () => {
    const result = fire('approved', loanContext({ destination: { supportedRails: ['ach'], accountState: 'frozen' } }), payload('disburse'));
    expect(result.state).toBe('needs_review');
    expect(ofType(result.effects, 'raise_exception').map((effect) => effect.exceptionClass)).toEqual(['no_eligible_rail']);
    expect(ofType(result.effects, 'send')).toEqual([]);
    expect(ofType(result.effects, 'post_ledger')).toEqual([]);
  });

  it('a late return reverses the ledger, raises an exception, and tells the truth', () => {
    const result = fire('funded', loanContext({ attemptCount: 1, lastRail: 'ach' }), payload('rail_returned', { returnCode: 'R01' }));
    expect(result.state).toBe('funded_pending_recovery');
    expect(result.context.lastReturnCode).toBe('R01');
    const entries = ofType(result.effects, 'post_ledger').flatMap((post) => post.entries);
    expect(entries.reduce((sum, entry) => sum + entry.deltaCents, 0)).toBe(0);
    expect(entries).toContainEqual({ account: 'funding_pool', deltaCents: 50_000, reason: 'ach_return_R01', eventId: 'ev_rail_returned' });
    expect(ofType(result.effects, 'raise_exception').map((effect) => effect.exceptionClass)).toEqual(['ach_return_after_settled']);
    const [notice] = ofType(result.effects, 'notify_borrower');
    expect(notice?.message).toMatch(/returned/i);
    expect(notice?.message).not.toMatch(/delivered/i);
  });
});

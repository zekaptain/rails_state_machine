import type { Scenario } from './types';

const LOAN = { loanId: 'ln_001', borrowerId: 'b_001', principalCents: 50_000, attempt: 0, maxAttempts: 3 };

export const SCENARIOS: Scenario[] = [
  {
    id: 'happy-rtp-closed',
    title: 'RTP disbursement, repaid in full, collateral released',
    level: 'easy',
    tags: ['rtp', 'happy_path'],
    ctx: { ...LOAN, destination: { railSupport: ['rtp', 'ach'], accountState: 'open' } },
    events: [
      { source: 'loan', id: 'e1', at: 600, command: 'approve' },
      { source: 'loan', id: 'e2', at: 601, command: 'disburse' },
      { source: 'rail', id: 'e3', at: 601, outcome: 'accepted' },
      { source: 'rail', id: 'e4', at: 602, outcome: 'settled' },
      { source: 'loan', id: 'e5', at: 700, command: 'schedule_started' },
      { source: 'loan', id: 'e6', at: 800, command: 'paid_in_full' },
      { source: 'collateral', id: 'e7', at: 801, action: 'release' },
    ],
    expected: { loan: 'closed', netFundsSentCents: 50_000, exceptions: [] },
  },
  // TODO: scenarios. Ideas, one per failure class:
  //   ach-late-return-R01         ACH settles, then returns R01 -> funded_pending_recovery, net 0
  //   ach-return-redisburse-wire  ...then redisburse before 16:00 goes by wire, never ACH -> funded
  //   rtp-rejected-reroute        RTP rejects, the ledger reverses, attempt 2 gets a new key
  //   frozen-account-review       no eligible rail -> needs_review, no send, no ledger post
  //   illegal-events-rejected     cancel while disbursing, an injected rail_settled
  //   default-liquidate-closed    missed payment, charge-off, liquidation
];

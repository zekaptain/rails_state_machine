/**
 * Every type the loan workflow uses. Types only: no runtime code lives here.
 */

export type RejectReason = 'no_transition' | 'guard_failed';

/**
 * One edge of a machine. Edges sharing (from, on) are tried in order: the
 * first passing guard wins, and an edge without a guard is the else branch.
 */
export interface Edge<S extends string, C, E extends { type: string }> {
  from: S;
  on: E['type'];
  to: S;
  guard?: (ctx: C, event: E) => boolean;
  action?: (ctx: C, event: E) => { ctx: C; effects: Effect[] };
}

export type StepResult<S extends string, C> =
  | { kind: 'ok'; state: S; ctx: C; effects: Effect[] }
  | { kind: 'rejected'; reason: RejectReason; state: S; ctx: C };

// Effects: descriptions of what should happen. The machine never performs them.

export interface LedgerEntry {
  account: string;
  deltaCents: number;
  reason: string;
  /** Id of the event that caused this post. */
  eventId: string;
}

export type Effect =
  | { type: 'send'; rail: Rail; idempotencyKey: string; amountCents: number }
  | { type: 'post_ledger'; entries: LedgerEntry[] }
  | { type: 'notify_borrower'; message: string }
  | { type: 'raise_exception'; class: string; context: Record<string, unknown> };


export type LoanState =
  | 'applied'
  | 'approved'
  | 'declined'
  | 'needs_review'
  | 'disbursing'
  | 'funded'
  | 'funded_pending_recovery'
  | 'repaying'
  | 'delinquent'
  | 'paid_off'
  | 'defaulted'
  | 'cancelled'
  | 'closed';

export type LoanEvent =
  | 'approve'
  | 'decline'
  | 'cancel'
  | 'disburse'
  | 'rail_settled'
  | 'rail_rejected'
  | 'rail_returned'
  | 'redisburse'
  | 'update_destination'
  | 'schedule_started'
  | 'paid_in_full'
  | 'missed_payment'
  | 'payment_received'
  | 'charge_off'
  | 'release_collateral'
  | 'liquidate_collateral';

export type TransitionTable = Readonly<Record<LoanState, Readonly<Partial<Record<LoanEvent, LoanState>>>>>;

export interface TransitionRecord {
  from: LoanState;
  event: LoanEvent;
  to: LoanState;
}

/** Raised only by the attempt child or the collateral region. */
export type InternalLoanEvent = 'rail_settled' | 'rail_rejected' | 'rail_returned' | 'release_collateral' | 'liquidate_collateral';

/** What the loan region's edges receive. */
export interface LoanInput {
  type: LoanEvent;
  id: string;
  /** Minutes since midnight, America/New_York. */
  at: number;
  /** rail_returned: the ACH return code (R01, R02, ...). */
  code?: string;
  /** rail_rejected: why the rail refused. */
  reason?: string;
  /** update_destination: the corrected bank account. */
  destination?: Destination;
}
export type Rail = 'rtp' | 'ach' | 'wire';
export type AccountState = 'open' | 'closed' | 'frozen' | 'unknown';

export interface Destination {
  railSupport: readonly Rail[];
  accountState: AccountState;
}

export interface LoanContext {
  loanId: string;
  borrowerId: string;
  principalCents: number;
  /** Attempts already created. 0 before the first send. */
  attempt: number;
  maxAttempts: number;
  destination: Destination;
  /** Set by a return. */
  lastReturnCode?: string;
  /** Rail used by the most recent attempt. */
  lastRail?: Rail;
}

// Composition (workflow.ts)

export type Region = 'loan' | 'attempt' | 'collateral';

export type AttemptPhase = 'sending' | 'accepted' | 'settled' | 'rejected';
export interface AttemptEvent {
  type: 'accepted' | 'settled' | 'rejected';
}
export interface Attempt {
  id: number;
  phase: AttemptPhase;
  rail: Rail;
  key: string;
}

export type CollateralState = 'in_vault' | 'released' | 'liquidated';
export interface CollateralEvent {
  type: 'release' | 'liquidate';
}

export interface Snapshot {
  loan: LoanState;
  ctx: LoanContext;
  /** The child machine. Present only while loan === 'disbursing'. */
  attempt: Attempt | null;
  collateral: CollateralState;
}

export type RailOutcome = 'accepted' | 'settled' | 'rejected' | 'returned';

/** One entry in the event log that drives the workflow. */
export type WorkflowEvent =
  | { source: 'loan'; id: string; at: number; command: LoanEvent; destination?: Destination }
  | { source: 'rail'; id: string; at: number; outcome: RailOutcome; code?: string; reason?: string }
  | { source: 'collateral'; id: string; at: number; action: CollateralEvent['type'] };

export interface RegionLog {
  region: Region;
  from: string;
  to: string;
  /** Id of the event that caused the move. */
  cause: string;
}

export interface DispatchResult {
  snapshot: Snapshot;
  effects: Effect[];
  log: RegionLog[];
}

// Scenarios and harness (scenarios.ts, harness.ts)

export interface Scenario {
  id: string;
  title: string;
  level: 'easy' | 'hard';
  tags: string[];
  ctx: LoanContext;
  events: WorkflowEvent[];
  expected: {
    loan: LoanState;
    netFundsSentCents: number;
    /** raise_exception classes, in order. */
    exceptions?: string[];
    /** Events the workflow must refuse. */
    rejectedEventIds?: string[];
  };
}

export type Correctness =
  | 'correct'
  | 'wrong_terminal_state'
  | 'ledger_mismatch'
  | 'duplicate_disbursement'
  | 'invariant_violation'
  | 'ui_status_mismatch'
  | 'crashed';

/** A subset of ../evals/result-row-spec.md. */
export interface ResultRow {
  scenario_id: string;
  level: 'easy' | 'hard';
  tags: string[];
  expected_terminal_state: string;
  actual_terminal_state: string;
  is_correct: boolean;
  correctness: Correctness;
  failed_checks: string[];
  net_funds_sent_usd: number;
  expected_net_funds_sent_usd: number;
  duplicate_disbursement: boolean;
  ledger_balanced: boolean;
  invariants_violated: string[];
  ui_status_truthful: boolean;
  state_transitions: number;
  outbound_calls: number;
  exceptions_raised: string[];
  rejected_event_ids: string[];
}

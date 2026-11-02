import type { Region, StepRejectionReason, WorkflowEvent } from './types';

/** Illegal transition error, extended with the region and the kind of "no". */
export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly event: string,
    public readonly region: Region = 'loan',
    public readonly reason: StepRejectionReason = 'no_transition',
  ) {
    super(`illegal transition in ${region}: ${reason} from '${from}' on '${event}'`);
    this.name = 'IllegalTransitionError';
  }
}

/** The event is not one this workflow accepts from outside, or nothing is there to receive it. */
export class UnhandledEventError extends Error {
  readonly event: WorkflowEvent;

  constructor(event: WorkflowEvent, reason: string) {
    super(`unhandled ${event.source} event '${event.id}': ${reason}`);
    this.name = 'UnhandledEventError';
    this.event = event;
  }
}

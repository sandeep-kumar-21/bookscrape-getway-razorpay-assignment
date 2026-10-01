export type SyncState = 'idle' | 'building' | 'ready' | 'failed';

export interface SyncStatus {
  readonly state: SyncState;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly error?: string;
  readonly sourceTotal?: number;
}

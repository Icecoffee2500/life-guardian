import type {
  DataSource,
  SignalQuality,
  SourceKind,
  SourceMode,
  SourceStatus,
} from './types';

/** 구독·상태 알림처럼 모든 소스가 똑같이 쓰는 부분만 모아둔 베이스. */
export abstract class BaseSource<S> implements DataSource<S> {
  abstract readonly kind: SourceKind;
  abstract readonly mode: SourceMode;
  abstract readonly label: string;

  protected subs = new Set<(s: S) => void>();
  private statusSubs = new Set<(s: SourceStatus) => void>();
  private _status: SourceStatus = 'idle';
  protected _quality: SignalQuality = 'ok';
  protected _error?: string;

  get status(): SourceStatus {
    return this._status;
  }

  get quality(): SignalQuality {
    return this._quality;
  }

  get error(): string | undefined {
    return this._error;
  }

  protected setStatus(s: SourceStatus, error?: string): void {
    this._status = s;
    this._error = error;
    if (s === 'error') this._quality = 'missing';
    for (const cb of this.statusSubs) cb(s);
  }

  protected push(sample: S): void {
    for (const cb of this.subs) cb(sample);
  }

  subscribe(cb: (s: S) => void): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  onStatusChange(cb: (s: SourceStatus) => void): () => void {
    this.statusSubs.add(cb);
    return () => {
      this.statusSubs.delete(cb);
    };
  }

  abstract connect(): Promise<void>;

  disconnect(): void {
    this.setStatus('idle');
  }
}

export type SlowEvent = { serverName: string; p95Ms: number; sampleSize: number };

export class LatencyTracker {
  record(_name: string, _ms: number): void {}
}

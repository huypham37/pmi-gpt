export interface Transport {
  start(): Promise<void>;
  stop(): void;
  send(data: Buffer): Promise<void>;
  onData: ((data: Buffer) => void) | null;
}

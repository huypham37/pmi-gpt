import { spawn, type ChildProcess } from "node:child_process";
import { ACPError } from "../errors/ACPError.js";
import type { Transport } from "./Transport.js";

export class StdioTransport implements Transport {
  private readonly executablePath: string;
  private readonly args: string[];
  private readonly environment: Record<string, string> | undefined;
  private readonly workingDirectory: string | undefined;
  private process: ChildProcess | null = null;

  onData: ((data: Buffer) => void) | null = null;

  constructor(opts: {
    executable: string;
    args: string[];
    environment?: Record<string, string>;
    workingDirectory?: string;
  }) {
    this.executablePath = opts.executable;
    this.args = opts.args;
    this.environment = opts.environment;
    this.workingDirectory = opts.workingDirectory;
  }

  async start(): Promise<void> {
    console.log(`[TRANSPORT-DEBUG] StdioTransport.start() - executable: ${this.executablePath}, args: ${this.args.join(' ')}, cwd: ${this.workingDirectory}`);
    const env = this.environment
      ? { ...process.env, ...this.environment }
      : undefined;

    let child: ChildProcess;
    try {
      child = spawn(this.executablePath, this.args, {
        env,
        cwd: this.workingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      console.log(`[TRANSPORT-DEBUG] spawn() threw synchronously: ${err instanceof Error ? err.message : String(err)}`);
      throw ACPError.transportError(
        `Failed to start process: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    console.log(`[TRANSPORT-DEBUG] spawn() returned, pid: ${child.pid}`);
    this.process = child;

    child.on("error", (err) => {
      console.log(`[ACP STDERR] Process error: ${err.message}`);
    });

    child.on("exit", (code, signal) => {
      console.log(`[TRANSPORT-DEBUG] Process exited - code: ${code}, signal: ${signal}`);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      if (text.length > 0) console.log(`[ACP STDERR] ${text}`);
    });

    let buffer = Buffer.alloc(0);
    const NEWLINE = 0x0a;

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      let idx: number;
      while ((idx = buffer.indexOf(NEWLINE)) !== -1) {
        const line = buffer.subarray(0, idx);
        buffer = buffer.subarray(idx + 1);
        if (line.length > 0) {
          this.onData?.(line);
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      const onSpawn = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(ACPError.transportError(`Failed to start process: ${err.message}`));
      };
      const cleanup = () => {
        child.removeListener("spawn", onSpawn);
        child.removeListener("error", onError);
      };
      child.on("spawn", onSpawn);
      child.on("error", onError);
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async send(data: Buffer): Promise<void> {
    const child = this.process;
    if (!child || !child.stdin || child.killed) {
      throw ACPError.processNotRunning();
    }
    const payload = Buffer.concat([data, Buffer.from("\n")]);
    return new Promise<void>((resolve, reject) => {
      child.stdin!.write(payload, (err) => {
        if (err) reject(ACPError.transportError(err.message));
        else resolve();
      });
    });
  }
}

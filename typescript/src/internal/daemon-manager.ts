import {randomBytes} from "node:crypto";
import {spawn, type ChildProcessByStdio} from "node:child_process";
import {platform} from "node:os";
import type {Readable, Writable} from "node:stream";

import {BilobaError} from "../index.js";

export interface StartDaemonOptions {
  executable: string;
  chromePath?: string;
  artifactDir?: string;
  readyTimeoutMs?: number;
}

export interface DaemonProcess {
  readonly address: string;
  readonly token: string;
  readonly pid: number;
  stop(): Promise<void>;
}

type DaemonChild = ChildProcessByStdio<Writable, Readable, Readable>;

export async function startDaemon(options: StartDaemonOptions): Promise<DaemonProcess> {
  const token = randomBytes(32).toString("hex");
  const args = [
    "--listen=127.0.0.1:0",
    `--token=${token}`,
    ...(options.chromePath ? [`--chrome-path=${options.chromePath}`] : []),
    ...(options.artifactDir ? [`--artifact-dir=${options.artifactDir}`] : []),
  ];
  const child = spawn(options.executable, args, {
    stdio: ["pipe", "pipe", "pipe"],
    detached: platform() !== "win32",
  });
  const stop = createStop(child);
  const killOnExit = () => killProcessGroup(child, "SIGTERM");
  process.once("exit", killOnExit);

  try {
    const address = await waitForReady(child, options.readyTimeoutMs ?? 10_000);
    if (!isLoopbackAddress(address)) {
      throw new BilobaError({
        code: "INVALID_ARGUMENT",
        message: `bilobad must listen on loopback; received ${address}`,
      });
    }
    if (child.pid === undefined) {
      throw new BilobaError({code: "DRIVER_CLOSED", message: "bilobad did not expose a process id"});
    }
    return {
      address,
      token,
      pid: child.pid,
      async stop() {
        process.removeListener("exit", killOnExit);
        await stop();
      },
    };
  } catch (error) {
    process.removeListener("exit", killOnExit);
    await stop();
    throw error;
  }
}

function waitForReady(child: DaemonChild, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new BilobaError({
        code: "DRIVER_CLOSED",
        message: `bilobad did not become ready within ${timeoutMs}ms`,
        daemonDetail: stderr,
      }));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.removeListener("data", onStdout);
      child.stderr.removeListener("data", onStderr);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
    };
    const onStderr = (chunk: Buffer | string) => {
      stderr += chunk.toString();
    };
    const onStdout = (chunk: Buffer | string) => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const ready = JSON.parse(line) as {address?: unknown};
          if (typeof ready.address === "string") {
            cleanup();
            resolve(ready.address);
            return;
          }
        } catch {
          // Startup logs may precede the single ready JSON line.
        }
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(new BilobaError({code: "DRIVER_CLOSED", message: `Could not start bilobad: ${error.message}`}));
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(new BilobaError({
        code: "DRIVER_CLOSED",
        message: `bilobad exited before ready (code=${String(code)}, signal=${String(signal)})`,
        daemonDetail: stderr,
      }));
    };
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

function createStop(child: DaemonChild): () => Promise<void> {
  let stopping: Promise<void> | undefined;
  return () => {
    stopping ??= new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      const forceTimer = setTimeout(() => killProcessGroup(child, "SIGKILL"), 2_000);
      child.once("exit", () => {
        clearTimeout(forceTimer);
        killProcessGroup(child, "SIGTERM");
        resolve();
      });
      child.stdin.end();
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) killProcessGroup(child, "SIGTERM");
      }, 250).unref();
    });
    return stopping;
  };
}

function killProcessGroup(child: DaemonChild, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (platform() === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ESRCH") throw error;
  }
}

function isLoopbackAddress(address: string): boolean {
  const host = address.startsWith("[") ? address.slice(1, address.indexOf("]")) : address.split(":")[0];
  return host === "::1" || host === "localhost" || host?.startsWith("127.") === true;
}

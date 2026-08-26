import {GrpcTransport, type WireOperationResult} from "./internal/grpc-transport.js";
import type {Assertion as WireAssertion} from "./generated/biloba/v1/Assertion.js";
import type {Locator as WireLocator} from "./generated/biloba/v1/Locator.js";
import {
  startDaemon as spawnDaemon,
  type DaemonProcess,
  type StartDaemonOptions,
} from "./internal/daemon-manager.js";

export type {DaemonProcess, StartDaemonOptions};

export type SerializableValue =
  | null
  | boolean
  | number
  | string
  | readonly SerializableValue[]
  | {readonly [key: string]: SerializableValue};

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
}

export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date | number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
}

export interface PollObservation {
  readonly attempt: number;
  readonly elapsedMs: number;
  readonly observed: unknown;
  readonly retryReason?: string;
}

export interface AssertionResult {
  readonly observed: unknown;
  readonly attemptCount: number;
  readonly trajectory: readonly PollObservation[];
  readonly rpcRequestCount: number;
  readonly rpcResponseCount: number;
  readonly elapsedMs?: number;
}

export type BilobaErrorCode =
  | "INVALID_ARGUMENT"
  | "TIMEOUT"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_READY"
  | "JAVASCRIPT_ERROR"
  | "PROTOCOL_MISMATCH"
  | "DRIVER_CLOSED"
  | "DRIVER_ERROR"
  | "CANCELLED";

interface BilobaErrorOptions {
  code: BilobaErrorCode;
  message: string;
  locator?: string;
  expected?: unknown;
  observed?: unknown;
  trajectory?: readonly PollObservation[];
  domOutline?: string;
  screenshotPath?: string;
  daemonDetail?: string;
  rpcRequestCount?: number;
  rpcResponseCount?: number;
  callsiteStack?: string;
}

export class BilobaError extends Error {
  readonly code: BilobaErrorCode;
  readonly locator?: string;
  readonly expected?: unknown;
  readonly observed?: unknown;
  readonly trajectory: readonly PollObservation[];
  readonly domOutline?: string;
  readonly screenshotPath?: string;
  readonly daemonDetail?: string;
  readonly rpcRequestCount?: number;
  readonly rpcResponseCount?: number;

  constructor(options: BilobaErrorOptions) {
    super(options.message);
    this.name = "BilobaError";
    this.code = options.code;
    if (options.locator !== undefined) this.locator = options.locator;
    if (options.expected !== undefined) this.expected = options.expected;
    if (options.observed !== undefined) this.observed = options.observed;
    this.trajectory = options.trajectory ?? [];
    if (options.domOutline !== undefined) this.domOutline = options.domOutline;
    if (options.screenshotPath !== undefined) this.screenshotPath = options.screenshotPath;
    if (options.daemonDetail !== undefined) this.daemonDetail = options.daemonDetail;
    if (options.rpcRequestCount !== undefined) this.rpcRequestCount = options.rpcRequestCount;
    if (options.rpcResponseCount !== undefined) this.rpcResponseCount = options.rpcResponseCount;
    if (options.callsiteStack) {
      this.stack = `${this.name}: ${this.message}\n${stripStackHeader(options.callsiteStack)}`;
    }
  }
}

export interface Locator {
  first(): Locator;
  click(options?: WaitOptions): Promise<void>;
  setValue(value: SerializableValue, options?: WaitOptions): Promise<void>;
  expectVisible(options?: WaitOptions): Promise<AssertionResult>;
  expectText(expected: string, options?: WaitOptions & {exact?: boolean}): Promise<AssertionResult>;
  expectCount(expected: number, options?: WaitOptions): Promise<AssertionResult>;
  expectAttribute(name: string, expected: string, options?: WaitOptions & {exact?: boolean}): Promise<AssertionResult>;
  expectValue(expected: SerializableValue, options?: WaitOptions): Promise<AssertionResult>;
}

export interface Session {
  readonly id: string;
  prepare(): Promise<void>;
  navigate(url: string, options?: WaitOptions): Promise<void>;
  setCookies(cookies: readonly Cookie[]): Promise<void>;
  evaluate<T = unknown>(expression: string, args?: readonly SerializableValue[], options?: WaitOptions): Promise<T>;
  close(): Promise<void>;
  locator(css: string): Locator;
  getByTestId(value: string): Locator;
  getByText(value: string, options?: {exact?: boolean}): Locator;
  getByRole(role: string, options?: {name?: string; exact?: boolean}): Locator;
  expectUrl(expected: string, options?: WaitOptions & {exact?: boolean; pathname?: boolean}): Promise<AssertionResult>;
  expectEvaluation(expression: string, expected: SerializableValue, options?: WaitOptions): Promise<AssertionResult>;
}

export interface Browser {
  readonly protocolVersion: string;
  readonly capabilities: ReadonlySet<string>;
  openSession(): Promise<Session>;
  close(): Promise<void>;
}

export interface ConnectOptions {
  address?: string;
  token?: string;
  daemonExecutable?: string;
  chromePath?: string;
  artifactDir?: string;
  signal?: AbortSignal;
}

class ClientBrowser implements Browser {
  readonly #transport: GrpcTransport;
  readonly #sessions = new Map<string, ClientSession>();
  readonly #stopDaemon?: () => Promise<void>;
  readonly protocolVersion: string;
  readonly capabilities: ReadonlySet<string>;
  #closed = false;

  constructor(
    transport: GrpcTransport,
    protocolVersion: string,
    capabilities: readonly string[],
    stopDaemon?: () => Promise<void>,
  ) {
    this.#transport = transport;
    this.protocolVersion = protocolVersion;
    this.capabilities = new Set(capabilities);
    if (stopDaemon) this.#stopDaemon = stopDaemon;
  }

  async openSession(): Promise<Session> {
    this.#assertOpen();
    const workerId = process.env.VITEST_POOL_ID ?? String(process.pid);
    const existing = this.#sessions.get(workerId);
    if (existing && !existing.closed) return existing;
    const response = await this.#transport.openSession({});
    const session = new ClientSession(response.sessionId ?? "", this.#transport, () => this.#sessions.delete(workerId));
    this.#sessions.set(workerId, session);
    return session;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.allSettled([...this.#sessions.values()].map(async (session) => session.close()));
    this.#sessions.clear();
    this.#transport.close();
    await this.#stopDaemon?.();
  }

  #assertOpen(): void {
    if (this.#closed) throw new BilobaError({code: "DRIVER_CLOSED", message: "Biloba browser is closed"});
  }
}

class ClientSession implements Session {
  readonly id: string;
  readonly #transport: GrpcTransport;
  readonly #onClose: () => void;
  closed = false;

  constructor(id: string, transport: GrpcTransport, onClose: () => void) {
    this.id = id;
    this.#transport = transport;
    this.#onClose = onClose;
  }

  async prepare(): Promise<void> {
    this.#assertOpen();
    await this.#transport.prepareSession({sessionId: this.id});
  }

  async navigate(url: string, options: WaitOptions = {}): Promise<void> {
    this.#assertOpen();
    await this.#transport.navigate({sessionId: this.id, url}, options);
  }

  async setCookies(cookies: readonly Cookie[]): Promise<void> {
    this.#assertOpen();
    await this.#transport.setCookies({
      sessionId: this.id,
      cookies: cookies.map(({expires, ...cookie}) => ({
        ...cookie,
        ...(expires !== undefined && {
          expiresUnix: typeof expires === "number" ? expires : expires.getTime() / 1_000,
        }),
      })),
    });
  }

  async evaluate<T = unknown>(
    expression: string,
    args: readonly SerializableValue[] = [],
    options: WaitOptions = {},
  ): Promise<T> {
    this.#assertOpen();
    const response = await this.#transport.evaluate({
      sessionId: this.id,
      expression,
      argumentsJson: JSON.stringify(args),
    }, options);
    return parseJson(response.observedJson) as T;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.#transport.closeSession({sessionId: this.id});
    } finally {
      this.#onClose();
    }
  }

  locator(css: string): Locator {
    return new ClientLocator(this, {kind: "CSS", value: css, match: "EXACT", first: false});
  }

  getByTestId(value: string): Locator {
    return new ClientLocator(this, {kind: "TEST_ID", value, match: "EXACT", first: false});
  }

  getByText(value: string, options: {exact?: boolean} = {}): Locator {
    return new ClientLocator(this, {
      kind: "TEXT",
      value,
      match: options.exact === true ? "EXACT" : "CONTAINS",
      first: false,
    });
  }

  getByRole(role: string, options: {name?: string; exact?: boolean} = {}): Locator {
    return new ClientLocator(this, {
      kind: "ROLE",
      role,
      ...(options.name !== undefined && {name: options.name}),
      match: options.exact === false ? "CONTAINS" : "EXACT",
      first: false,
    });
  }

  async expectUrl(
    expected: string,
    options: WaitOptions & {exact?: boolean; pathname?: boolean} = {},
  ): Promise<AssertionResult> {
    const callsiteStack = new Error().stack;
    if (options.pathname) {
      return await this.assert({
        kind: "EVALUATE",
        expression: "window.location.pathname",
        expectedJson: JSON.stringify(expected),
      }, options, callsiteStack);
    }
    return await this.assert({
      kind: "URL",
      expectedString: expected,
      match: matchMode(options.exact),
    }, options, callsiteStack);
  }

  async expectEvaluation(
    expression: string,
    expected: SerializableValue,
    options: WaitOptions = {},
  ): Promise<AssertionResult> {
    const callsiteStack = new Error().stack;
    return await this.assert({
      kind: "EVALUATE",
      expression,
      expectedJson: JSON.stringify(expected),
    }, options, callsiteStack);
  }

  async assert(
    assertion: WireAssertion,
    options: WaitOptions,
    callsiteStack: string | undefined,
  ): Promise<AssertionResult> {
    this.#assertOpen();
    try {
      const response = await this.#transport.assert({
        sessionId: this.id,
        assertion,
        poll: pollPolicy(options),
      }, {
        ...options,
        ...(options.timeoutMs !== undefined && {deadlineMs: options.timeoutMs + 2_100}),
      });
      return assertionResult(response, callsiteStack);
    } catch (error) {
      if (error instanceof BilobaError && callsiteStack && !error.stack?.includes(stripStackHeader(callsiteStack))) {
        error.stack = `${error.name}: ${error.message}\n${stripStackHeader(callsiteStack)}`;
      }
      throw error;
    }
  }

  async action(
    method: "click" | "setValue",
    locator: WireLocator,
    payload: Record<string, unknown>,
    options: WaitOptions,
  ): Promise<void> {
    this.#assertOpen();
    const request = {
      sessionId: this.id,
      locator,
      ...payload,
      poll: pollPolicy(options),
    };
    if (method === "click") await this.#transport.click(request, options);
    else await this.#transport.setValue(request, options);
  }

  #assertOpen(): void {
    if (this.closed) throw new BilobaError({code: "DRIVER_CLOSED", message: `Biloba session ${this.id} is closed`});
  }
}

class ClientLocator implements Locator {
  readonly #session: ClientSession;
  readonly #locator: WireLocator;

  constructor(session: ClientSession, locator: WireLocator) {
    this.#session = session;
    this.#locator = locator;
  }

  first(): Locator {
    return new ClientLocator(this.#session, {...this.#locator, first: true});
  }

  async click(options: WaitOptions = {}): Promise<void> {
    await this.#session.action("click", this.#locator, {}, options);
  }

  async setValue(value: SerializableValue, options: WaitOptions = {}): Promise<void> {
    await this.#session.action("setValue", this.#locator, {valueJson: JSON.stringify(value)}, options);
  }

  async expectVisible(options: WaitOptions = {}): Promise<AssertionResult> {
    return await this.#assert({kind: "VISIBLE", locator: this.#locator}, options);
  }

  async expectText(
    expected: string,
    options: WaitOptions & {exact?: boolean} = {},
  ): Promise<AssertionResult> {
    return await this.#assert({
      kind: "TEXT",
      locator: this.#locator,
      expectedString: expected,
      match: matchMode(options.exact),
    }, options);
  }

  async expectCount(expected: number, options: WaitOptions = {}): Promise<AssertionResult> {
    return await this.#assert({kind: "COUNT", locator: this.#locator, expectedCount: expected}, options);
  }

  async expectAttribute(
    name: string,
    expected: string,
    options: WaitOptions & {exact?: boolean} = {},
  ): Promise<AssertionResult> {
    return await this.#assert({
      kind: "ATTRIBUTE",
      locator: this.#locator,
      attribute: name,
      expectedString: expected,
      match: matchMode(options.exact),
    }, options);
  }

  async expectValue(expected: SerializableValue, options: WaitOptions = {}): Promise<AssertionResult> {
    return await this.#assert({kind: "VALUE", locator: this.#locator, expectedJson: JSON.stringify(expected)}, options);
  }

  async #assert(assertion: WireAssertion, options: WaitOptions): Promise<AssertionResult> {
    const callsiteStack = new Error().stack;
    return await this.#session.assert(assertion, options, callsiteStack);
  }
}

export async function connect(options: ConnectOptions = {}): Promise<Browser> {
  let daemon: DaemonProcess | undefined;
  const executable = options.daemonExecutable ?? process.env.BILOBA_DAEMON_EXECUTABLE;
  const suppliedAddress = options.address ?? process.env.BILOBA_DAEMON_ADDRESS;
  const suppliedToken = options.token ?? process.env.BILOBA_DAEMON_TOKEN;
  if (!suppliedAddress && executable) {
    daemon = await spawnDaemon({
      executable,
      ...(options.chromePath && {chromePath: options.chromePath}),
      ...(options.artifactDir && {artifactDir: options.artifactDir}),
    });
  }
  const address = suppliedAddress ?? daemon?.address;
  const token = suppliedToken ?? daemon?.token;
  if (!address || !token) {
    await daemon?.stop();
    throw new BilobaError({
      code: "INVALID_ARGUMENT",
      message: "connect requires address and token unless daemonExecutable is supplied",
    });
  }
  const transport = new GrpcTransport(address, token);
  try {
    const handshake = await transport.handshake(
      {protocolVersion: "1"},
      options.signal ? {signal: options.signal} : {},
    );
    if (handshake.protocolVersion !== "1") {
      throw new BilobaError({
        code: "PROTOCOL_MISMATCH",
        message: `Biloba protocol mismatch: client 1, daemon ${handshake.protocolVersion}`,
      });
    }
    return new ClientBrowser(
      transport,
      handshake.protocolVersion ?? "",
      handshake.capabilities ?? [],
      daemon ? () => daemon.stop() : undefined,
    );
  } catch (error) {
    transport.close();
    await daemon?.stop();
    throw error;
  }
}

export async function startDaemon(options: StartDaemonOptions): Promise<DaemonProcess> {
  return await spawnDaemon(options);
}

function assertionResult(response: WireOperationResult, callsiteStack: string | undefined): AssertionResult {
  const observed = parseJson(response.observedJson);
  const trajectory = (response.trajectory ?? []).map((entry) => ({
    attempt: entry.attempt ?? 0,
    elapsedMs: Number(entry.elapsedMs ?? 0),
    observed: parseJson(entry.observedJson),
    ...(entry.retryReason && {retryReason: entry.retryReason}),
  }));
  if (!response.matched) {
    const diagnostics = response.diagnostics ?? {};
    const message = [
      "Biloba assertion timed out",
      diagnostics.locator ? `locator: ${diagnostics.locator}` : undefined,
      diagnostics.expected ? `expected: ${diagnostics.expected}` : undefined,
      `last observed: ${JSON.stringify(observed)}`,
      `attempts: ${response.attemptCount ?? trajectory.length}`,
    ].filter((line): line is string => line !== undefined).join("\n");
    throw new BilobaError({
      code: "TIMEOUT",
      message,
      ...(diagnostics.locator && {locator: diagnostics.locator}),
      ...(diagnostics.expected && {expected: diagnostics.expected}),
      observed,
      trajectory,
      ...(diagnostics.domOutline && {domOutline: diagnostics.domOutline}),
      ...(diagnostics.screenshotPath && {screenshotPath: diagnostics.screenshotPath}),
      ...(diagnostics.daemonDetail && {daemonDetail: diagnostics.daemonDetail}),
      rpcRequestCount: response.rpcRequestCount ?? 0,
      rpcResponseCount: response.rpcResponseCount ?? 0,
      ...(callsiteStack && {callsiteStack}),
    });
  }
  return {
    observed,
    attemptCount: response.attemptCount || trajectory.length,
    trajectory,
    rpcRequestCount: response.rpcRequestCount ?? 0,
    rpcResponseCount: response.rpcResponseCount ?? 0,
    ...(response.timings && {elapsedMs: Number(response.timings.elapsedMs ?? 0)}),
  };
}

function pollPolicy(options: WaitOptions): Record<string, number> {
  return {
    ...(options.timeoutMs !== undefined && {timeoutMs: options.timeoutMs}),
    ...(options.intervalMs !== undefined && {intervalMs: options.intervalMs}),
  };
}

function matchMode(exact: boolean | undefined): "EXACT" | "CONTAINS" {
  return exact === false ? "CONTAINS" : "EXACT";
}

function parseJson(value: string | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function stripStackHeader(stack: string): string {
  const newline = stack.indexOf("\n");
  return newline === -1 ? stack : stack.slice(newline + 1);
}

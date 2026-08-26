import {Server, ServerCredentials, type sendUnaryData, type ServerUnaryCall} from "@grpc/grpc-js";
import {afterEach, beforeEach, describe, expect, it} from "vitest";

import {
  BilobaError,
  connect,
  type AssertionResult,
  type Browser,
  type Cookie,
} from "../src/index.js";
import {loadDriverDefinition, type WireServiceDefinition} from "../src/internal/protocol.js";

type UnaryCallback = sendUnaryData<Record<string, unknown>>;
type UnaryCall = ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>;

describe("Biloba TypeScript client", () => {
  let server: Server;
  let address: string;
  let browser: Browser | undefined;
  let assertImplementation: (call: UnaryCall, callback: UnaryCallback) => void;
  const requests: Array<{method: string; request: Record<string, unknown>}> = [];

  beforeEach(async () => {
    requests.length = 0;
    assertImplementation = (call, callback) => {
      requests.push({method: "Assert", request: call.request});
      callback(null, {
        matched: true,
        observedJson: JSON.stringify("Saved"),
        attemptCount: 2,
        trajectory: [
          {attempt: 1, elapsedMs: 0, observedJson: JSON.stringify("Saving")},
          {attempt: 2, elapsedMs: 10, observedJson: JSON.stringify("Saved")},
        ],
        rpcRequestCount: 1,
        rpcResponseCount: 1,
      });
    };
    server = new Server();
    server.addService(loadDriverDefinition() as WireServiceDefinition, {
      handshake(call: UnaryCall, callback: UnaryCallback) {
        requests.push({method: "Handshake", request: call.request});
        expect(call.metadata.get("authorization")).toEqual(["Bearer secret-token"]);
        callback(null, {protocolVersion: "1", capabilities: ["assertions", "evaluate"]});
      },
      openSession(call: UnaryCall, callback: UnaryCallback) {
        requests.push({method: "OpenSession", request: call.request});
        callback(null, {sessionId: "session-1"});
      },
      prepareSession: recordVoid("PrepareSession"),
      closeSession: recordVoid("CloseSession"),
      navigate: recordVoid("Navigate"),
      setCookies: recordVoid("SetCookies"),
      click: recordVoid("Click"),
      setValue: recordVoid("SetValue"),
      evaluate(call: UnaryCall, callback: UnaryCallback) {
        requests.push({method: "Evaluate", request: call.request});
        callback(null, {matched: true, observedJson: JSON.stringify({ready: true})});
      },
      assert(call: UnaryCall, callback: UnaryCallback) {
        assertImplementation(call, callback);
      },
    });
    address = await bind(server);

    function recordVoid(method: string) {
      return (call: UnaryCall, callback: UnaryCallback) => {
        requests.push({method, request: call.request});
        callback(null, {});
      };
    }
  });

  afterEach(async () => {
    await browser?.close();
    server.forceShutdown();
  });

  it("negotiates the protocol and sends idiomatic session operations over gRPC", async () => {
    browser = await connect({address, token: "secret-token"});
    expect(browser.protocolVersion).toBe("1");
    expect(browser.capabilities).toEqual(new Set(["assertions", "evaluate"]));

    const session = await browser.openSession();
    const cookies: Cookie[] = [{name: "auth", value: "abc", domain: "localhost", httpOnly: true}];
    await session.prepare();
    await session.setCookies(cookies);
    await session.navigate("http://localhost/bookings");
    await session.getByRole("button", {name: "Save", exact: true}).first().click();
    await session.getByTestId("name").setValue("Ada");
    expect(await session.evaluate<{ready: boolean}>("window.appState")).toEqual({ready: true});
    await session.close();

    expect(requests).toMatchObject([
      {method: "Handshake", request: {protocolVersion: "1"}},
      {method: "OpenSession"},
      {method: "PrepareSession", request: {sessionId: "session-1"}},
      {method: "SetCookies", request: {sessionId: "session-1", cookies}},
      {method: "Navigate", request: {sessionId: "session-1", url: "http://localhost/bookings"}},
      {
        method: "Click",
        request: {
          sessionId: "session-1",
          locator: {
            kind: "ROLE",
            role: "button",
            name: "Save",
            match: "EXACT",
            first: true,
          },
        },
      },
      {
        method: "SetValue",
        request: {
          sessionId: "session-1",
          locator: {kind: "TEST_ID", value: "name", match: "EXACT", first: false},
          valueJson: JSON.stringify("Ada"),
        },
      },
      {method: "Evaluate", request: {sessionId: "session-1", expression: "window.appState"}},
      {method: "CloseSession", request: {sessionId: "session-1"}},
    ]);
  });

  it("expresses every pilot locator and assertion as one RPC", async () => {
    browser = await connect({address, token: "secret-token"});
    const session = await browser.openSession();

    const results: AssertionResult[] = [
      await session.locator("main").expectVisible(),
      await session.getByText("Saved", {exact: false}).expectText("Saved", {exact: true, timeoutMs: 50}),
      await session.locator("article").expectCount(3),
      await session.getByTestId("save").expectAttribute("aria-busy", "false"),
      await session.locator("input").expectValue("Ada"),
      await session.expectUrl("/bookings", {pathname: true}),
      await session.expectEvaluation("window.ready", true),
    ];

    expect(results.every((result) => result.attemptCount === 2)).toBe(true);
    expect(results.every((result) => result.rpcRequestCount === 1 && result.rpcResponseCount === 1)).toBe(true);
    expect(requests.filter(({method}) => method === "Assert")).toHaveLength(7);
    expect(requests.at(-1)).toMatchObject({
      method: "Assert",
      request: {
        sessionId: "session-1",
        assertion: {
          kind: "EVALUATE",
          expression: "window.ready",
          expectedJson: "true",
        },
      },
    });
  });

  it("accepts cookie expiry timestamps returned by the SIV sign-in helper", async () => {
    browser = await connect({address, token: "secret-token"});
    const session = await browser.openSession();

    await session.setCookies([{name: "session", value: "abc", expires: 1_800_000_000}]);

    expect(requests.at(-1)).toMatchObject({
      method: "SetCookies",
      request: {
        cookies: [{name: "session", value: "abc", expiresUnix: 1_800_000_000}],
      },
    });
  });

  it("turns a structured assertion mismatch into a BilobaError at the TypeScript callsite", async () => {
    assertImplementation = (call, callback) => {
      requests.push({method: "Assert", request: call.request});
      callback(null, {
        matched: false,
        observedJson: JSON.stringify("Saving"),
        attemptCount: 1,
        trajectory: [{attempt: 1, elapsedMs: 0, observedJson: JSON.stringify("Saving"), retryReason: "text mismatch"}],
        diagnostics: {
          locator: "getByText(Saved)",
          expected: "Saved",
          domOutline: "body\n  button Saving",
          screenshotPath: "/tmp/failure.png",
          daemonDetail: "timed out after 50ms",
        },
        rpcRequestCount: 1,
        rpcResponseCount: 1,
      });
    };
    browser = await connect({address, token: "secret-token"});
    const session = await browser.openSession();

    const invokeFromTest = () => session.getByText("Saved").expectText("Saved", {timeoutMs: 50});
    const error = await invokeFromTest().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BilobaError);
    expect((error as Error).message).toContain("Biloba assertion timed out");
    expect((error as Error).message).toContain("locator: getByText(Saved)");
    expect((error as Error).message).toContain("last observed: \"Saving\"");
    expect((error as Error).message).toContain("attempts: 1");
    expect(error).toMatchObject({
      code: "TIMEOUT",
      locator: "getByText(Saved)",
      expected: "Saved",
      observed: "Saving",
      domOutline: "body\n  button Saving",
      screenshotPath: "/tmp/failure.png",
      daemonDetail: "timed out after 50ms",
      rpcRequestCount: 1,
      rpcResponseCount: 1,
    });
    expect((error as Error).stack).toContain("invokeFromTest");
    expect((error as BilobaError).trajectory).toEqual([
      {attempt: 1, elapsedMs: 0, observed: "Saving", retryReason: "text mismatch"},
    ]);
  });

  it("cancels the in-flight gRPC assertion when its AbortSignal aborts", async () => {
    let observeStart!: () => void;
    let observeCancellation!: () => void;
    const started = new Promise<void>((resolve) => {
      observeStart = resolve;
    });
    const cancelled = new Promise<void>((resolve) => {
      observeCancellation = resolve;
    });
    assertImplementation = (call) => {
      observeStart();
      call.on("cancelled", observeCancellation);
    };
    browser = await connect({address, token: "secret-token"});
    const session = await browser.openSession();
    const controller = new AbortController();

    const assertion = session.locator("main").expectVisible({signal: controller.signal});
    await started;
    controller.abort("worker stopped");

    await expect(assertion).rejects.toMatchObject({code: "CANCELLED"});
    await cancelled;
  });

  it("uses the assertion timeout as the gRPC deadline and keeps the test callsite", async () => {
    assertImplementation = () => {};
    browser = await connect({address, token: "secret-token"});
    const session = await browser.openSession();

    const invokeTimedAssertion = () => session.locator("main").expectVisible({timeoutMs: 20});
    const error = await invokeTimedAssertion().catch((reason: unknown) => reason);

    expect(error).toMatchObject({code: "TIMEOUT"});
    expect((error as Error).stack).toContain("invokeTimedAssertion");
  });
});

async function bind(server: Server): Promise<string> {
  const port = await new Promise<number>((resolve, reject) => {
    server.bindAsync("127.0.0.1:0", ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) reject(error);
      else resolve(boundPort);
    });
  });
  return `127.0.0.1:${port}`;
}

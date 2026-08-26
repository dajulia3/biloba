import {createReadStream} from "node:fs";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {createServer, type Server} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {BilobaError, connect, type Browser, type Session} from "../src/index.js";

const fixturePath = fileURLToPath(new URL("../../fixtures/graft-parity.html", import.meta.url));
const expectedPath = fileURLToPath(new URL("../../fixtures/graft-parity-expected.json", import.meta.url));
const daemonExecutable = process.env.BILOBA_DAEMON_EXECUTABLE;
const chromeExecutable = process.env.BILOBA_CHROME_HEADLESS_SHELL;

describe.skipIf(!daemonExecutable || !chromeExecutable)("Go and TypeScript parity contract", () => {
  let server: Server;
  let baseUrl: string;
  let browser: Browser;
  let session: Session;
  let artifactDir: string;

  beforeAll(async () => {
    server = createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      createReadStream(fixturePath).pipe(response);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture server did not bind TCP");
    baseUrl = `http://127.0.0.1:${address.port}`;
    artifactDir = await mkdtemp(join(tmpdir(), "biloba-parity-"));
    browser = await connect({daemonExecutable: daemonExecutable!, chromePath: chromeExecutable!, artifactDir});
    session = await browser.openSession();
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    await rm(artifactDir, {recursive: true, force: true});
  });

  it("reaches the same shared observable outcome through the TypeScript API", async () => {
    await session.prepare();
    await session.navigate(baseUrl);
    await session.getByRole("heading", {name: "Biloba parity"}).expectVisible();
    const delayed = await session.locator("#delayed").expectText("ready", {timeoutMs: 1_000, intervalMs: 5});
    expect(delayed.attemptCount).toBeGreaterThan(1);

    await session.getByTestId("name").setValue("Ada");
    await session.getByTestId("name").expectValue("Ada");
    await session.getByRole("button", {name: "Increment"}).click();

    const actual = await session.evaluate(`({
      count: document.querySelector('#count').innerText,
      delayed: document.querySelector('#delayed').innerText,
      echo: document.querySelector('#echo').innerText,
      heading: document.querySelector('h1').innerText,
      value: document.querySelector('[data-testid="name"]').value,
    })`);
    const expected = JSON.parse(await readFile(expectedPath, "utf8")) as unknown;
    expect(actual).toEqual(expected);
  });

  it("returns structured failure output from the real daemon", async () => {
    await session.prepare();
    await session.navigate(baseUrl);

    const failure = await session.locator("#never").expectText("ready", {timeoutMs: 40, intervalMs: 5})
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BilobaError);
    expect(failure).toMatchObject({
      code: "TIMEOUT",
      locator: `locator("#never")`,
      expected: "ready",
      rpcRequestCount: 1,
      rpcResponseCount: 1,
    });
    expect((failure as BilobaError).trajectory.length).toBeGreaterThan(1);
    expect((failure as BilobaError).domOutline).toContain("Biloba parity");
    expect((failure as BilobaError).screenshotPath).toMatch(/biloba-failure-\d+\.png$/);
  });
});

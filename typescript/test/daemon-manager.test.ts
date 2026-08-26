import {mkdtemp, readFile, rm, writeFile, chmod} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";

import {startDaemon, type DaemonProcess} from "../src/index.js";

describe("bilobad process manager", () => {
  let daemon: DaemonProcess | undefined;
  let directory: string | undefined;

  afterEach(async () => {
    await daemon?.stop();
    if (directory) await rm(directory, {recursive: true, force: true});
  });

  it("spawns a supplied executable with a dynamic loopback address and generated token", async () => {
    directory = await mkdtemp(join(tmpdir(), "biloba-daemon-test-"));
    const executable = join(directory, "fake-bilobad");
    const argumentsPath = join(directory, "arguments.json");
    await writeFile(executable, `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(argumentsPath)}, JSON.stringify(process.argv.slice(2)));
console.log(JSON.stringify({address: "127.0.0.1:43123", protocolVersion: "1", capabilities: ["assertions"]}));
process.on("SIGTERM", () => process.exit(0));
process.stdin.resume();
process.stdin.on("end", () => process.exit(0));
setInterval(() => {}, 1000);
`);
    await chmod(executable, 0o755);

    daemon = await startDaemon({
      executable,
      chromePath: "/opt/chrome",
      artifactDir: "/tmp/biloba-artifacts",
    });

    expect(daemon.address).toBe("127.0.0.1:43123");
    expect(daemon.token).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(await readFile(argumentsPath, "utf8"))).toEqual([
      "--listen=127.0.0.1:0",
      `--token=${daemon.token}`,
      "--chrome-path=/opt/chrome",
      "--artifact-dir=/tmp/biloba-artifacts",
    ]);
    expect(daemon.pid).toBeGreaterThan(0);

    const pid = daemon.pid;
    await daemon.stop();
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("rejects non-loopback ready addresses and terminates the child", async () => {
    directory = await mkdtemp(join(tmpdir(), "biloba-daemon-test-"));
    const executable = join(directory, "unsafe-bilobad");
    await writeFile(executable, `#!/usr/bin/env node
console.log(JSON.stringify({address: "0.0.0.0:43123"}));
setInterval(() => {}, 1000);
`);
    await chmod(executable, 0o755);

    await expect(startDaemon({executable})).rejects.toMatchObject({code: "INVALID_ARGUMENT"});
  });

  it("reports stderr when the daemon exits before becoming ready", async () => {
    directory = await mkdtemp(join(tmpdir(), "biloba-daemon-test-"));
    const executable = join(directory, "broken-bilobad");
    await writeFile(executable, `#!/usr/bin/env node
process.stderr.write("chrome executable is missing\\n");
process.exit(7);
`);
    await chmod(executable, 0o755);

    await expect(startDaemon({executable})).rejects.toMatchObject({
      code: "DRIVER_CLOSED",
      daemonDetail: "chrome executable is missing\n",
    });
  });

  it.runIf(process.platform !== "win32")("reaps descendant processes when the daemon stops", async () => {
    directory = await mkdtemp(join(tmpdir(), "biloba-daemon-test-"));
    const executable = join(directory, "daemon-with-child");
    const descendantPath = join(directory, "descendant.pid");
    await writeFile(executable, `#!/usr/bin/env node
const fs = require("node:fs");
const {spawn} = require("node:child_process");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {stdio: "ignore"});
fs.writeFileSync(${JSON.stringify(descendantPath)}, String(child.pid));
console.log(JSON.stringify({address: "127.0.0.1:43124"}));
process.stdin.resume();
process.stdin.on("end", () => process.exit(0));
setInterval(() => {}, 1000);
`);
    await chmod(executable, 0o755);
    daemon = await startDaemon({executable});
    const descendantPid = Number(await readFile(descendantPath, "utf8"));

    await daemon.stop();

    await expect.poll(() => processExists(descendantPid), {timeout: 2_000}).toBe(false);
  });
});

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

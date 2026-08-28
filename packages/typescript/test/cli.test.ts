import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const tscPath = fileURLToPath(
  new URL("../../../node_modules/typescript/bin/tsc", import.meta.url),
);
const temporaryDirectory = mkdtempSync(join(tmpdir(), "identifold-cli-"));
const registryPath = join(temporaryDirectory, "registry.json");

function run(...arguments_: string[]) {
  return spawnSync(process.execPath, [cliPath, ...arguments_], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("identifold CLI", () => {
  beforeAll(() => {
    execFileSync(process.execPath, [tscPath, "-p", "tsconfig.build.json"], {
      cwd: packageRoot,
    });
    writeFileSync(
      registryPath,
      JSON.stringify([
        { publicPrefix: "user" },
        {
          publicPrefix: "order",
          reference: { prefix: "ORD", strategy: "random" },
        },
      ]),
    );
  });

  afterAll(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("creates MID and PID JSON", () => {
    const result = run("new", "user", "--json");
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as Record<string, string>;
    expect(output.mid).toMatch(/-7[0-9a-f]{3}-/);
    expect(output.pid).toMatch(/^user_/);
    expect(result.stderr).toBe("");
  });

  it("inspects, validates, and normalizes identifiers", () => {
    const created = JSON.parse(run("new", "user", "--json").stdout) as Record<
      string,
      string
    >;
    const pid = created.pid;
    expect(pid).toBeDefined();
    if (pid === undefined) return;
    expect(
      JSON.parse(
        run("inspect", pid, "--registry", registryPath, "--json").stdout,
      ),
    ).toMatchObject({ kind: "pid", valid: true });
    expect(run("validate", "not-an-id", "--json").status).toBe(2);
    expect(JSON.parse(run("validate", "not-an-id", "--json").stdout)).toEqual({
      valid: false,
    });
    expect(
      run("normalize", pid, "--registry", registryPath, "--json").status,
    ).toBe(0);
  });

  it("runs conformance and keeps malformed input stack-free", () => {
    const conformance = run("conformance", "--json");
    expect(conformance.status).toBe(0);
    expect(JSON.parse(conformance.stdout)).toMatchObject({ failed: 0 });
    const malformed = run("inspect", "bad", "--json");
    expect(malformed.status).toBe(2);
    expect(malformed.stderr).not.toMatch(/\bat\s|Error:/);
  }, 15_000);

  it("uses exit code 3 for configuration failures", () => {
    const result = run(
      "inspect",
      "bad",
      "--registry",
      join(temporaryDirectory, "missing.json"),
      "--json",
    );
    expect(result.status).toBe(3);
    expect(JSON.parse(result.stdout)).toEqual({ error: "configuration_error" });
  });
});

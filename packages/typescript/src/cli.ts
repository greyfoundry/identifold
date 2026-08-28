#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { IdentifoldError } from "./errors.js";
import { createMachineId } from "./machine.js";
import { publicIdFromMachineId } from "./public.js";
import {
  createNamespaceRegistry,
  type NamespaceDefinition,
} from "./registry.js";
import { createIdentifold } from "./service.js";

class ConfigurationError extends Error {}

interface Options {
  readonly adapter: string | undefined;
  readonly json: boolean;
  readonly registry: string | undefined;
  readonly positional: readonly string[];
}

function main(arguments_: readonly string[]): number {
  const command = arguments_[0];
  const options = parseOptions(arguments_.slice(1));
  if (command === "conformance") return runConformance(options);
  if (command === "new") return createNew(options);
  if (
    command === "inspect" ||
    command === "validate" ||
    command === "normalize"
  ) {
    return processIdentifier(command, options);
  }
  write({ error: "invalid_command" }, options.json);
  return 2;
}

function createNew(options: Options): number {
  const namespace = options.positional[0];
  if (namespace === undefined || options.positional.length !== 1) {
    write({ error: "invalid_input" }, options.json);
    return 2;
  }
  try {
    const mid = createMachineId();
    const pid = publicIdFromMachineId(mid, namespace);
    write({ mid, pid }, options.json);
    return 0;
  } catch (error) {
    return handleError(error, options.json);
  }
}

function processIdentifier(
  command: "inspect" | "normalize" | "validate",
  options: Options,
): number {
  const value = options.positional[0];
  if (value === undefined || options.positional.length !== 1) {
    write({ error: "invalid_input" }, options.json);
    return 2;
  }
  try {
    const ids = createIdentifold({
      registry: loadRegistry(options.registry, value),
    });
    if (command === "inspect") {
      const inspection = ids.inspect(value);
      write(inspection, options.json);
      return inspection.valid ? 0 : 2;
    }
    if (command === "validate") {
      const valid = ids.validate(value);
      write({ valid }, options.json);
      return valid ? 0 : 2;
    }
    const normalized = ids.normalize(value);
    write({ normalized }, options.json);
    return 0;
  } catch (error) {
    return handleError(error, options.json);
  }
}

function runConformance(options: Options): number {
  const root = process.cwd();
  const adapter = resolve(
    root,
    options.adapter ?? "conformance/typescript-adapter.mjs",
  );
  const runner = resolve(root, "conformance/runner.py");
  const vectors = resolve(root, "vectors");
  const result = spawnSync(
    "python",
    [runner, "--adapter", adapter, "--vectors", vectors, "--json"],
    {
      encoding: "utf8",
    },
  );
  if (result.status === 0) {
    const report: unknown = JSON.parse(result.stdout);
    write(report, options.json);
    return 0;
  }
  write(
    {
      error: result.status === 1 ? "conformance_failed" : "configuration_error",
    },
    options.json,
  );
  return 3;
}

function loadRegistry(path: string | undefined, value: string) {
  if (path !== undefined) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      const definitions = Array.isArray(parsed)
        ? parsed
        : isRecord(parsed) && Array.isArray(parsed.namespaces)
          ? parsed.namespaces
          : undefined;
      if (definitions === undefined) throw new ConfigurationError();
      return createNamespaceRegistry(definitions as NamespaceDefinition[]);
    } catch (error) {
      if (error instanceof IdentifoldError) throw error;
      throw new ConfigurationError();
    }
  }
  const separator = value.indexOf("_");
  return createNamespaceRegistry(
    separator > 0 ? [{ publicPrefix: value.slice(0, separator) }] : [],
  );
}

function parseOptions(arguments_: readonly string[]): Options {
  const positional: string[] = [];
  let adapter: string | undefined;
  let registry: string | undefined;
  let json = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--json") json = true;
    else if (argument === "--adapter") adapter = arguments_[++index];
    else if (argument === "--registry") registry = arguments_[++index];
    else if (argument !== undefined) positional.push(argument);
  }
  return { adapter, json, registry, positional };
}

function handleError(error: unknown, json: boolean): number {
  if (error instanceof ConfigurationError) {
    write({ error: "configuration_error" }, json);
    return 3;
  }
  if (error instanceof IdentifoldError) {
    write({ error: error.code }, json);
    return 2;
  }
  write({ error: "runtime_error" }, json);
  return 3;
}

function write(value: unknown, json: boolean): void {
  if (json || typeof value !== "string")
    process.stdout.write(`${JSON.stringify(value)}\n`);
  else process.stdout.write(`${value}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

process.exitCode = main(process.argv.slice(2));

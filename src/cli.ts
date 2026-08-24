#!/usr/bin/env node

import { handleCancellation, runSetup, runStatus, runUpdate, runVersion } from "./commands.js";

const HELP = `aiconf

Safely synchronize global AI agent configuration.

Usage:
  aiconf setup     Configure tools and install the latest release
  aiconf update    Review and apply the latest release
  aiconf status    Report versions, drift, path problems, and optional tools
  aiconf version   Print the installed command version
  aiconf help      Show this help
`;

async function main(): Promise<void> {
  const command = process.argv[2] ?? "help";
  if (command === "setup") {
    await runSetup();
    return;
  }
  if (command === "update") {
    await runUpdate();
    return;
  }
  if (command === "status") {
    process.exitCode = await runStatus();
    return;
  }
  if (command === "version") {
    await runVersion();
    return;
  }
  if (command === "help") {
    process.stdout.write(HELP);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

try {
  await main();
} catch (error) {
  if (!handleCancellation(error)) {
    process.stderr.write(`aiconf: ${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}

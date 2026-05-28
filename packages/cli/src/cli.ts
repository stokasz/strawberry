#!/usr/bin/env node

import { runDoctor } from './commands/doctor.ts';
import { runLogin } from './commands/login.ts';
import { runLogs } from './commands/logs.ts';
import { runOnboard } from './commands/onboard.ts';
import { runStart } from './commands/start.ts';
import { runStatus } from './commands/status.ts';
import { runStop } from './commands/stop.ts';
import { resolveStrawberryPaths } from './paths.ts';
import { runProduction } from './production.ts';
import { printHelp } from './tui.ts';

async function main(): Promise<number> {
  const commandIndex = process.argv[2] === '--' ? 3 : 2;
  const command = process.argv[commandIndex]?.trim();

  switch (command) {
    case 'onboard':
      return runOnboard();
    case 'login':
      return runLogin();
    case 'start':
    case undefined:
      return runStart();
    case 'stop':
      return runStop();
    case 'status':
      return runStatus();
    case 'doctor':
      return runDoctor();
    case 'prepare':
      return runProduction('prepare', resolveStrawberryPaths());
    case 'build-image':
      return runProduction('build-image', resolveStrawberryPaths());
    case 'logs':
      return runLogs(process.argv[commandIndex + 1]?.trim());
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return 0;
    default:
      printHelp();
      console.error(`Unknown command: ${command}`);
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });

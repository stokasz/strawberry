import {
  buildStackImage,
  formatStackError,
  prepareStack,
  startStack,
  statusStack,
  stopStack,
  tailStackLogs
} from './stack.ts';
import type { StrawberryPaths } from './paths.ts';

export async function runProduction(
  command: 'start' | 'stop' | 'status' | 'build-image' | 'prepare' | 'tail-logs',
  paths: StrawberryPaths
): Promise<number> {
  try {
    switch (command) {
      case 'prepare':
        await prepareStack(paths);
        break;
      case 'start':
        await startStack(paths);
        break;
      case 'stop':
        await stopStack(paths);
        break;
      case 'status':
        await statusStack(paths);
        break;
      case 'build-image':
        await buildStackImage(paths);
        break;
      case 'tail-logs':
        return await tailStackLogs(paths);
    }
    return 0;
  } catch (error) {
    console.error(formatStackError(error));
    return 1;
  }
}

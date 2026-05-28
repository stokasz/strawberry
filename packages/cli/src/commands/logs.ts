import { formatStackError, printStackLogs, type StackLogTarget } from '../stack.ts';
import { resolveStrawberryPaths } from '../paths.ts';

const LOG_TARGETS = new Set(['all', 'host', 'telegram', 'agent']);

function parseTarget(raw: string | undefined): StackLogTarget {
  if (!raw) return 'all';
  if (LOG_TARGETS.has(raw)) return raw as StackLogTarget;
  throw new Error('Usage: strawberry logs [all|host|telegram|agent]');
}

export async function runLogs(rawTarget?: string): Promise<number> {
  try {
    const paths = resolveStrawberryPaths();
    await printStackLogs(paths, parseTarget(rawTarget));
    return 0;
  } catch (error) {
    console.error(formatStackError(error));
    return 1;
  }
}

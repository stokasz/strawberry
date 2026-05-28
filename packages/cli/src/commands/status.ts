import { resolveStrawberryPaths } from '../paths.ts';
import { runProduction } from '../production.ts';
import { printStatusHeader } from '../tui.ts';

export async function runStatus(): Promise<number> {
  const paths = resolveStrawberryPaths();
  printStatusHeader();
  return runProduction('status', paths);
}

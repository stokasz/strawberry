import { resolveStrawberryPaths } from '../paths.ts';
import { runProduction } from '../production.ts';
import { printInfo, printStopHeader, printSuccess } from '../tui.ts';

export async function runStop(): Promise<number> {
  const paths = resolveStrawberryPaths();
  printStopHeader();
  const code = await runProduction('stop', paths);
  if (code === 0) {
    printSuccess('Stopped', ['Run `strawberry` when you are ready again.']);
  } else {
    printInfo('Stop failed.');
  }
  return code;
}

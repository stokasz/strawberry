const VISION = 'Add multiplayer AI to your group chat and have fun with crypto again';

const WIDTH = 72;

type ArtTone = 'leaf' | 'body' | 'seed' | 'stem' | 'muted';

type ArtSegment = {
  text: string;
  tone: ArtTone;
};

type ArtLine = {
  segments: ArtSegment[];
};

const STRAWBERRY_ART: ArtLine[] = [
  { segments: [{ text: '      ', tone: 'body' }, { text: '{\\__/}', tone: 'leaf' }, { text: '              ', tone: 'body' }, { text: '{\\__/}', tone: 'muted' }] },
  { segments: [{ text: '      ', tone: 'body' }, { text: '( o_o)', tone: 'seed' }, { text: '              ', tone: 'body' }, { text: '(o_o )', tone: 'muted' }, { text: '  share?', tone: 'muted' }] },
  { segments: [{ text: '      ', tone: 'body' }, { text: '/ > 🍓', tone: 'seed' }, { text: '              ', tone: 'body' }, { text: '\\ <', tone: 'muted' }] },
  { segments: [] },
  { segments: [{ text: '      ', tone: 'body' }, { text: '{\\__/}', tone: 'leaf' }, { text: '              ', tone: 'body' }, { text: '{\\__/}', tone: 'muted' }] },
  { segments: [{ text: '      ', tone: 'body' }, { text: '( o_o)', tone: 'seed' }, { text: '              ', tone: 'body' }, { text: '(o_o )', tone: 'muted' }] },
  { segments: [{ text: '      ', tone: 'body' }, { text: '/ > 🍓  ---->', tone: 'seed' }, { text: '       ', tone: 'body' }, { text: '\\ <', tone: 'muted' }] },
  { segments: [] },
  { segments: [{ text: '      ', tone: 'body' }, { text: '{\\__/}', tone: 'muted' }, { text: '              ', tone: 'body' }, { text: '{\\__/}', tone: 'leaf' }] },
  { segments: [{ text: '      ', tone: 'body' }, { text: '( ^_^)', tone: 'muted' }, { text: '              ', tone: 'body' }, { text: '(^_^ )', tone: 'seed' }] },
  { segments: [{ text: '      ', tone: 'body' }, { text: '/', tone: 'muted' }, { text: '                   ', tone: 'body' }, { text: '🍓 < \\', tone: 'seed' }] }
];

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[38;5;203m',
  green: '\x1b[38;5;114m',
  yellow: '\x1b[38;5;229m',
  pink: '\x1b[38;5;210m',
  muted: '\x1b[38;5;245m',
  white: '\x1b[97m',
  ok: '\x1b[38;5;114m',
  fail: '\x1b[38;5;203m'
} as const;

function useColor(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

function paint(text: string, ...codes: string[]): string {
  if (!useColor()) {
    return text;
  }
  return `${codes.join('')}${text}${COLORS.reset}`;
}

export function center(text: string, width = WIDTH): string {
  const visible = stripAnsi(text);
  if (visible.length >= width) {
    return text;
  }
  const pad = Math.floor((width - visible.length) / 2);
  return `${' '.repeat(Math.max(0, pad))}${text}`;
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function toneColor(tone: ArtTone): string {
  switch (tone) {
    case 'leaf':
      return COLORS.green;
    case 'seed':
      return COLORS.red;
    case 'stem':
      return COLORS.green;
    case 'body':
      return COLORS.white;
    case 'muted':
      return COLORS.muted;
    default:
      return COLORS.red;
  }
}

function renderArtLine(line: ArtLine): string {
  return line.segments.map((segment) => paint(segment.text, toneColor(segment.tone))).join('');
}

export function printStrawberryArt(options: { vision?: boolean } = {}): void {
  console.log('');
  const renderedLines = STRAWBERRY_ART.map((line) => renderArtLine(line));
  const artWidth = Math.max(...renderedLines.map((line) => stripAnsi(line).length));
  const pad = Math.floor(Math.max(0, WIDTH - artWidth) / 2);
  for (const line of renderedLines) {
    console.log(`${' '.repeat(pad)}${line}`);
  }
  if (options.vision) {
    console.log('');
    console.log(center(paint(VISION, COLORS.bold, COLORS.white)));
    console.log('');
  } else {
    console.log('');
  }
}

export function printDivider(): void {
  console.log(paint('─'.repeat(WIDTH), COLORS.muted));
}

export function printCommandHeader(title: string, subtitle?: string): void {
  printStrawberryArt();
  console.log(center(paint(title, COLORS.bold, COLORS.white)));
  if (subtitle) {
    console.log(center(paint(subtitle, COLORS.muted)));
  }
  console.log('');
}

export function printLaunchBanner(): void {
  printStrawberryArt({ vision: true });
}

export function printStep(number: number, title: string, detail?: string): void {
  console.log('');
  console.log(paint(`  ${number}. ${title}`, COLORS.bold, COLORS.white));
  if (detail) {
    console.log(paint(`     ${detail}`, COLORS.muted));
  }
}

export function printHint(text: string): void {
  console.log(paint(`  ${text}`, COLORS.muted));
}

export function printSuccess(title: string, lines: string[] = []): void {
  console.log('');
  console.log(paint(`  ✓ ${title}`, COLORS.ok, COLORS.bold));
  for (const line of lines) {
    console.log(paint(`    ${line}`, COLORS.muted));
  }
  console.log('');
}

export function printError(message: string): void {
  console.error(paint(`  ✗ ${message}`, COLORS.fail));
}

export function paintMuted(text: string): string {
  return paint(text, COLORS.muted);
}

export function printInfo(message: string): void {
  console.log(paint(`  ${message}`, COLORS.muted));
}

export function printRunningPanel(lines: string[]): void {
  printStrawberryArt();
  printDivider();
  console.log(center(paint('Strawberry is running', COLORS.bold, COLORS.ok)));
  console.log(center(paint('sharing the fruit in Telegram', COLORS.bold, COLORS.pink)));
  console.log('');
  for (const line of lines) {
    console.log(center(paint(line, COLORS.muted)));
  }
  console.log('');
  console.log(center(`${paint('●', COLORS.ok)} ${paint('stack healthy', COLORS.ok)}  ${paint('●', COLORS.pink)} ${paint('Telegram UX active', COLORS.pink)}`));
  console.log(center(paint('logs collapsed here — run `strawberry logs` for details', COLORS.muted)));
  console.log('');
  console.log(center(paint('Press Ctrl+C to stop', COLORS.muted)));
  printDivider();
  console.log('');
}

export function printHelp(): void {
  printStrawberryArt({ vision: true });
  printDivider();
  console.log(center(paint('Commands', COLORS.bold, COLORS.white)));
  console.log('');
  printCommandRow('strawberry', 'Run Telegram + agent + host');
  printCommandRow('strawberry onboard', 'First-time setup');
  printCommandRow('strawberry stop', 'Stop everything');
  printCommandRow('strawberry status', 'See what is running');
  printCommandRow('strawberry doctor', 'Check config and health');
  printCommandRow('strawberry prepare', 'Validate config and prepare the container image');
  printCommandRow('strawberry logs', 'Show recent host, Telegram, and agent logs');
  printCommandRow('strawberry login', 'Change Pi model auth');
  console.log('');
  printDivider();
  console.log(center(paint('Pi handles model subscriptions. Auth lives in .strawberry/auth.json', COLORS.muted)));
  console.log('');
}

function printCommandRow(command: string, description: string): void {
  console.log(`  ${paint(command.padEnd(28), COLORS.bold, COLORS.pink)} ${paint(description, COLORS.muted)}`);
}

export function printDoctorHeader(): void {
  printCommandHeader('Health check', 'Quick look at config, auth, and the stack');
}

export function printDoctorCheck(name: string, ok: boolean, detail: string): void {
  const mark = ok ? paint('✓', COLORS.ok) : paint('✗', COLORS.fail);
  const label = name.padEnd(22);
  console.log(`  ${mark}  ${label}${paint(detail, COLORS.muted)}`);
}

export function printStatusHeader(): void {
  printCommandHeader('Status', 'Host, Telegram, and agent container');
}

export function printStopHeader(): void {
  printCommandHeader('Stopping', 'Shutting down the stack');
}

export { VISION };

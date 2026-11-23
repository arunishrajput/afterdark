/** `pnpm bots -- --code ABC123 --count 7`: bot players for demos and tests (TESTING.md §5). */
import { parseBotArgs, USAGE } from './args';
import { Bot } from './bot';

const log = (line: string) => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  let args;
  try {
    args = parseBotArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  const bots: Bot[] = [];
  for (let i = 1; i <= args.count; i++) {
    const bot = new Bot({
      url: args.url,
      code: args.code,
      name: `bot-${i}`,
      seed: args.seed,
      speed: args.speed,
      imposterBehaviour: args.imposterBehaviour,
      meetings: args.meetings,
      log,
    });
    if (await bot.start()) bots.push(bot);
  }
  log(`${bots.length} bot(s) running. Ctrl+C to stop.`);
  const stop = () => {
    for (const b of bots) b.stop();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

void main();

import chalk from "chalk";
import yargs from "yargs";
import { listStackResources } from "./stack-resources";

async function parseCommandLineArguments(args: string[]) {
  return yargs
    .option("stack-name", {
      type: "string",
      demandOption: true,
      requiresArg: true,
    })
    .parse(args);
}

if (!process.stdout.isTTY) {
  // Disable chalk color highlighting
  process.env.FORCE_COLOR = "0";
}

export async function exec(args: string[]): Promise<number | void> {
  const argv = await parseCommandLineArguments(args);
  return listStackResources(argv.stackName);
}

export function cli(args: string[] = process.argv.slice(2)) {
  exec(args)
    .then(async (value) => {
      if (typeof value === "number") {
        process.exitCode = value;
      }
    })
    .catch((err) => {
      console.log(chalk.red(err));
      if (err.stack) {
        console.log(chalk.yellow(err.stack));
      }
      process.exitCode = 1;
    });
}

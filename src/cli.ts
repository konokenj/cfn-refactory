import chalk from "chalk";
import yargs from "yargs/yargs";
import { generateImportJsonCommand } from "./generate-import-json";
import { injectPolicyCommand, DeletionPolicy } from "./inject-policy";

if (!process.stdout.isTTY) {
  // Disable chalk color highlighting
  process.env.FORCE_COLOR = "0";
}

async function exec(args: string[]) {
  return yargs(args)
    .option("verbose", { type: "boolean" })
    .command(
      "generate-import-json <stack>",
      "Generate a list of stack resources with primary identifier to use in resource import",
      function builder(yarg) {
        return yarg
          .positional("stack", { type: "string", demandOption: true })
          .option("out", { alias: "o", type: "string" });
      },
      async function handler(argv) {
        await generateImportJsonCommand({
          stackName: argv.stack,
          out: argv.out,
        });
      },
    )
    .command(
      "inject-policy <template>",
      "Inject DeletionPolicy into all resources in the template. Template must be a JSON file.",
      function builder(yarg) {
        return yarg
          .positional("template", { type: "string", demandOption: true })
          .option("deletion-policy", {
            type: "string",
            choices: [
              DeletionPolicy.Retain,
              DeletionPolicy.RetainExceptOnCreate,
              DeletionPolicy.Delete,
            ],
            default: DeletionPolicy.RetainExceptOnCreate,
          })
          .option("out", { alias: "o", type: "string" });
      },
      async function handler(argv) {
        await injectPolicyCommand({
          templatePath: argv.template,
          deletionPolicy: argv.deletionPolicy,
          out: argv.out,
        });
      },
    )
    .demandCommand()
    .wrap(72)
    .help()
    .parse();
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

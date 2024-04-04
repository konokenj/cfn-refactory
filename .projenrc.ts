import { typescript } from "projen";
const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: "main",
  name: "cfn-refactory",
  projenrcTs: true,
  prettier: true,
  eslint: true,
  deps: ["chalk@4.1.2", "yargs", "@aws-sdk/client-cloudformation"],
  releaseToNpm: true,
  npmProvenance: false, // https://github.com/projen/projen/issues/3479
});
project.addScripts({
  app: "npx ts-node --prefer-ts-exts src/index.ts ",
  integ: "npx projen test --testMatch '**/test/integ.*'",
});
project.addGitIgnore("/test/temp");
project.addGitIgnore("/testdata/*.json");
project.synth();

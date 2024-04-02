import { typescript } from "projen";
const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: "main",
  name: "cloudformation-refactoring-helper",
  projenrcTs: true,
  prettier: true,
  eslint: true,
  deps: ["chalk@4.1.2", "yargs", "@aws-sdk/client-cloudformation"],
  releaseToNpm: true,

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();

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

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();

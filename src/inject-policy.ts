import { readFileSync, writeFileSync } from "fs";

export interface InjectDeletionPolicyProps {
  templatePath: string;
  deletionPolicy: string;
  out?: string;
}

export enum DeletionPolicy {
  Delete = "Delete",
  Retain = "Retain",
  RetainExceptOnCreate = "RetainExceptOnCreate",
  // 'Snapshot' is excluded because it is not supported all resources
}

export async function injectPolicy(
  props: InjectDeletionPolicyProps,
): Promise<any> {
  const template = readFileSync(props.templatePath);
  const templateBody = JSON.parse(template.toString());
  if (templateBody.Resources) {
    for (const logicalResourceId in templateBody.Resources) {
      if (!templateBody.Resources[logicalResourceId].DeletionPolicy) {
        templateBody.Resources[logicalResourceId].DeletionPolicy =
          props.deletionPolicy;
      }
    }
  }
  return templateBody;
}

export async function injectPolicyCommand(
  props: InjectDeletionPolicyProps,
): Promise<void> {
  const templateBody = await injectPolicy(props);
  if (props.out) {
    writeFileSync(props.out, JSON.stringify(templateBody, null, 2), "utf8");
    return;
  }
  console.log(JSON.stringify(templateBody, null, 2));
}

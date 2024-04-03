import { readFileSync, writeFileSync } from "fs";

export interface InjectDeletionPolicyProps {
  templatePath: string;
  policy: string;
  out?: string;
}

export async function injectDeletionPolicy(
  props: InjectDeletionPolicyProps,
): Promise<any> {
  const template = readFileSync(props.templatePath);
  const templateBody = JSON.parse(template.toString());
  if (templateBody.Resources) {
    for (const logicalResourceId in templateBody.Resources) {
      if (!templateBody.Resources[logicalResourceId].DeletionPolicy) {
        templateBody.Resources[logicalResourceId].DeletionPolicy = props.policy;
      }
    }
  }
  return templateBody;
}

export async function injectDeletionPolicyCommand(
  props: InjectDeletionPolicyProps,
): Promise<void> {
  const templateBody = await injectDeletionPolicy(props);
  if (props.out) {
    writeFileSync(props.out, JSON.stringify(templateBody, null, 2), "utf8");
    return;
  }
  console.log(JSON.stringify(templateBody, null, 2));
}

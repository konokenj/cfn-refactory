import { writeFileSync } from "fs";
import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeTypeCommand,
  RegistryType,
  StackResource,
} from "@aws-sdk/client-cloudformation";

const cfnClient = new CloudFormationClient();
const primaryIdentifiers = new Map<string, string>();
const primaryIdentifierPrefix = "/properties/";
const ignoredTypes = ["AWS::CDK::Metadata"];
export interface ResourceImportIdentifier {
  ResourceType: string;
  LogicalResourceId: string;
  ResourceIdentifier: {
    [name: string]: string;
  };
}
export interface ListStackResourcesProps {
  stackName: string;
  out?: string;
}

async function getStackResources(
  stackName: string,
): Promise<StackResource[] | undefined> {
  const response = await cfnClient.send(
    new DescribeStackResourcesCommand({ StackName: stackName }),
  );
  return response.StackResources;
}

async function getPrimaryIdentifierName(resourceType: string): Promise<string> {
  if (primaryIdentifiers.has(resourceType)) {
    return primaryIdentifiers.get(resourceType)!;
  }
  const response = await cfnClient.send(
    new DescribeTypeCommand({
      Type: RegistryType.RESOURCE,
      TypeName: resourceType,
    }),
  );
  if (!response.Schema) {
    throw new Error(`No schema for ${resourceType}`);
  }
  const schema = JSON.parse(response.Schema);
  const primaryIdentifier = schema.primaryIdentifier?.[0];
  if (!primaryIdentifier) {
    throw new Error(`No primary identifier for ${resourceType}`);
  }
  const primaryIdentifierName = primaryIdentifier.replace(
    primaryIdentifierPrefix,
    "",
  );
  primaryIdentifiers.set(resourceType, primaryIdentifierName);
  return primaryIdentifierName;
}

export async function listStackResources(
  props: ListStackResourcesProps,
): Promise<ResourceImportIdentifier[]> {
  const resourceImportIdentifiers: ResourceImportIdentifier[] = [];
  const resources = await getStackResources(props.stackName);
  if (!resources) {
    return resourceImportIdentifiers;
  }

  for (const resource of resources) {
    if (
      !resource.ResourceType ||
      !resource.LogicalResourceId ||
      !resource.PhysicalResourceId
    ) {
      continue;
    }
    if (ignoredTypes.includes(resource.ResourceType)) {
      continue;
    }

    const primaryIdentifierName = await getPrimaryIdentifierName(
      resource.ResourceType,
    );
    resourceImportIdentifiers.push({
      LogicalResourceId: resource.LogicalResourceId,
      ResourceType: resource.ResourceType,
      ResourceIdentifier: {
        [primaryIdentifierName]: resource.PhysicalResourceId,
      },
    });
  }
  return resourceImportIdentifiers;
}

export async function listStackResourcesCommand(
  props: ListStackResourcesProps,
): Promise<void> {
  const resources = await listStackResources(props);
  if (props.out) {
    writeFileSync(props.out, JSON.stringify(resources, null, 2), "utf8");
    return;
  }
  console.log(JSON.stringify(resources, null, 2));
}

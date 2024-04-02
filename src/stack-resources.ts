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
interface ResourceImportIdentifier {
  ResourceType: string;
  LogicalResourceId: string;
  ResourceIdentifier: {
    [name: string]: string;
  };
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

export async function listStackResources(stackName: string): Promise<void> {
  const resources = await getStackResources(stackName);
  if (!resources) {
    return;
  }

  const resourceImportIdentifiers: ResourceImportIdentifier[] = [];
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
  console.log(JSON.stringify(resourceImportIdentifiers, null, 2));
}

import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import {
  CloudFormationClient,
  CreateChangeSetCommand,
  CreateStackCommand,
  DeleteStackCommand,
  ExecuteChangeSetCommand,
  UpdateStackCommand,
  waitUntilChangeSetCreateComplete,
  waitUntilStackCreateComplete,
  waitUntilStackDeleteComplete,
  waitUntilStackImportComplete,
  waitUntilStackUpdateComplete,
} from "@aws-sdk/client-cloudformation";
import { generateImportJsonCommand } from "../src/generate-import-json";
import { injectPolicyCommand } from "../src/inject-policy";

jest.setTimeout(300000);
const stackName = "CfnRefactory-Integ-Import";
const templateDir = "test/temp";
const templateBody = `
AWSTemplateFormatVersion: "2010-09-09"
Resources:
  Bucket1:
    Type: AWS::S3::Bucket
  Queue1:
    Type: AWS::SQS::Queue
  Queue2:
    Type: AWS::SQS::Queue
    DeletionPolicy: Delete
`;
const templateBodyToBeforeImport = `
AWSTemplateFormatVersion: "2010-09-09"
Resources:
  Queue2:
    Type: AWS::SQS::Queue
    DeletionPolicy: Delete
`;
const templateBodyToDelete = `
AWSTemplateFormatVersion: "2010-09-09"
Resources:
  Bucket1:
    Type: AWS::S3::Bucket
    DeletionPolicy: Delete
  Queue1:
    Type: AWS::SQS::Queue
    DeletionPolicy: Delete
  Queue2:
    Type: AWS::SQS::Queue
    DeletionPolicy: Delete
`;
const cfnClient = new CloudFormationClient();

beforeAll(async () => {
  console.log(`Saving templates to ${templateDir}`);
  if (existsSync(templateDir)) {
    rmSync(templateDir, { recursive: true });
  }
  mkdirSync(templateDir, { recursive: true });
  writeFileSync(`${templateDir}/${stackName}.template.yml`, templateBody);

  console.log(`Converting templates to JSON with rain`);
  const stdout = execSync(
    `rain fmt --json ${templateDir}/${stackName}.template.yml > ${templateDir}/${stackName}.template.json`,
  );
  console.log(stdout.toString());

  console.log("Creating CloudFormation Stack");
  await cfnClient.send(
    new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
    }),
  );

  await waitUntilStackCreateComplete(
    { client: cfnClient, maxWaitTime: 300 },
    { StackName: stackName },
  );
});

describe("should be able to generate import.json", () => {
  let migrateJsonBody: any;
  beforeAll(async () => {
    console.log("Executing GenerateImportJson");
    await generateImportJsonCommand({
      stackName,
      out: `${templateDir}/${stackName}.import.json`,
    });
    migrateJsonBody = JSON.parse(
      readFileSync(`${templateDir}/${stackName}.import.json`).toString(),
    );
  });

  it("should has 3 resources", () => {
    expect(migrateJsonBody).toHaveLength(3);
  });
});

describe("should be able to inject DeletionPolicy", () => {
  let templateJsonBody: any;
  beforeAll(async () => {
    await injectPolicyCommand({
      deletionPolicy: "RetainExceptOnCreate",
      templatePath: `${templateDir}/${stackName}.template.json`,
      out: `${templateDir}/${stackName}.injected.json`,
    });
    templateJsonBody = JSON.parse(
      readFileSync(`${templateDir}/${stackName}.injected.json`).toString(),
    );
  });

  it("all resources should have DeletionPolicy", () => {
    for (const key in templateJsonBody.Resources) {
      if (key == "Queue2") {
        expect(templateJsonBody.Resources[key]).toMatchObject({
          DeletionPolicy: "Delete",
        });
      } else {
        expect(templateJsonBody.Resources[key]).toMatchObject({
          DeletionPolicy: "RetainExceptOnCreate",
        });
      }
    }
  });

  it("should be deployed successfully", async () => {
    console.log("Updating CloudFormation Stack to set DeletionPolicy");
    await cfnClient.send(
      new UpdateStackCommand({
        StackName: stackName,
        TemplateBody: JSON.stringify(templateJsonBody),
      }),
    );
    const result = await waitUntilStackUpdateComplete(
      { client: cfnClient, maxWaitTime: 300 },
      { StackName: stackName },
    );
    expect(result.state).toBe("SUCCESS");
    return;
  });
});

describe("should be able to import", () => {
  let migrateJsonBody: any;
  beforeAll(async () => {
    console.log("Updating CloudFormation Stack to remove resources");
    await cfnClient.send(
      new UpdateStackCommand({
        StackName: stackName,
        TemplateBody: templateBodyToBeforeImport,
      }),
    );
    await waitUntilStackUpdateComplete(
      { client: cfnClient, maxWaitTime: 300 },
      { StackName: stackName },
    );

    migrateJsonBody = JSON.parse(
      readFileSync(`${templateDir}/${stackName}.import.json`).toString(),
    );
    let filtered: any[] = [];
    for (const resource of migrateJsonBody) {
      if (resource.LogicalResourceId != "Queue2") {
        filtered.push(resource);
      }
    }
    migrateJsonBody = filtered;
  });

  it("should be able to import resources", async () => {
    console.log("Importing CloudFormation Stack");
    await cfnClient.send(
      new CreateChangeSetCommand({
        StackName: stackName,
        ChangeSetName: "import",
        ChangeSetType: "IMPORT",
        ResourcesToImport: migrateJsonBody,
        TemplateBody: templateBodyToDelete,
      }),
    );
    await waitUntilChangeSetCreateComplete(
      { client: cfnClient, maxWaitTime: 300 },
      { StackName: stackName, ChangeSetName: "import" },
    );

    await cfnClient.send(
      new ExecuteChangeSetCommand({
        StackName: stackName,
        ChangeSetName: "import",
      }),
    );
    const result = await waitUntilStackImportComplete(
      { client: cfnClient, maxWaitTime: 300 },
      { StackName: stackName },
    );
    expect(result.state).toBe("SUCCESS");
  });
});

afterAll(async () => {
  console.log("Deleting CloudFormation Stack");
  await cfnClient.send(new DeleteStackCommand({ StackName: stackName }));
  await waitUntilStackDeleteComplete(
    { client: cfnClient, maxWaitTime: 300 },
    { StackName: stackName },
  );
});

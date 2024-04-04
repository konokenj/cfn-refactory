import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
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
const stackName1 = "CfnRefactory-Integ-Import1";
const stackName2 = "CfnRefactory-Integ-Import2";
const tempDir = "test/temp";
const testdataDir = "testdata";
const cfnClient = new CloudFormationClient();

beforeAll(async () => {
  console.log(`Saving templates to ${tempDir}`);
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true });
  }
  mkdirSync(tempDir, { recursive: true });

  // 1. (準備) Stack1のテンプレート(YAML)を作成してデプロイする
  console.log("1. (準備) Stack1のテンプレート(YAML)を作成してデプロイする");
  await cfnClient.send(
    new CreateStackCommand({
      StackName: stackName1,
      TemplateBody: readFileSync(`${testdataDir}/Stack1.before.yml`).toString(),
    }),
  );

  await waitUntilStackCreateComplete(
    { client: cfnClient, maxWaitTime: 300 },
    { StackName: stackName1 },
  );
});

describe("should be able to generate import.json", () => {
  let importJsonBody: any;
  beforeAll(async () => {
    // 2. Stack1のすべてのスタックリソースを含む、インポート用のJSONを生成する
    console.log(
      "2. Stack1のすべてのスタックリソースを含む、インポート用のJSONを生成する",
    );
    await generateImportJsonCommand({
      stackName: stackName1,
      out: `${tempDir}/Stack1.import.json`,
    });
    importJsonBody = JSON.parse(
      readFileSync(`${tempDir}/Stack1.import.json`).toString(),
    );
  });

  it("should has 3 resources", () => {
    expect(importJsonBody).toHaveLength(3);
  });
});

describe("should be able to inject DeletionPolicy", () => {
  let templateJsonBody: any;
  beforeAll(async () => {
    // 3. Stack1のテンプレート(YAML)をJSONに変換する
    console.log(`3. Stack1のテンプレート(YAML)をJSONに変換する`);
    const stdout = execSync(
      `rain fmt --json ${testdataDir}/Stack1.before.yml > ${tempDir}/Stack1.before.json`,
    );
    console.log(stdout.toString());

    // 4. Stack1のテンプレート(JSON)に含まれるすべてのリソースに `DeletionPolicy` を設定する
    console.log(
      "4. Stack1のテンプレート(JSON)に含まれるすべてのリソースに `DeletionPolicy` を設定する",
    );
    await injectPolicyCommand({
      deletionPolicy: "RetainExceptOnCreate",
      templatePath: `${tempDir}/Stack1.before.json`,
      out: `${tempDir}/Stack1.retain.json`,
    });
    templateJsonBody = JSON.parse(
      readFileSync(`${tempDir}/Stack1.retain.json`).toString(),
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
    // 5. Stack1をテンプレート(JSON)で更新して、`DeletionPolicy` を反映する
    console.log(
      "5. Stack1をテンプレート(JSON)で更新して、`DeletionPolicy` を反映する",
    );
    await cfnClient.send(
      new UpdateStackCommand({
        StackName: stackName1,
        TemplateBody: JSON.stringify(templateJsonBody),
      }),
    );
    const result = await waitUntilStackUpdateComplete(
      { client: cfnClient, maxWaitTime: 300 },
      { StackName: stackName1 },
    );
    expect(result.state).toBe("SUCCESS");
  });
});

describe("should be able to import", () => {
  let importJsonBody: any;
  beforeAll(async () => {
    // 7. Stack1をテンプレート(JSON)で更新して、移動させるリソースを削除する (`DELETE_SKIP`)
    console.log(
      "7. Stack1をテンプレート(JSON)で更新して、移動させるリソースを削除する (`DELETE_SKIP`)",
    );
    await cfnClient.send(
      new UpdateStackCommand({
        StackName: stackName1,
        TemplateBody: readFileSync(
          `${testdataDir}/Stack1.after.yml`, // 6
        ).toString(),
      }),
    );
    await waitUntilStackUpdateComplete(
      { client: cfnClient, maxWaitTime: 300 },
      { StackName: stackName1 },
    );

    // 8. インポート用のJSONから、移動させないリソースを削除する
    console.log("8. インポート用のJSONから、移動させないリソースを削除する");
    importJsonBody = JSON.parse(
      readFileSync(`${tempDir}/Stack1.import.json`).toString(),
    );
    let filtered: any[] = [];
    for (const resource of importJsonBody) {
      if (resource.LogicalResourceId != "Queue2") {
        filtered.push(resource);
      }
    }
    importJsonBody = filtered;
  });

  // 9. Stack2のテンプレート(YAML)を作成して、変更セットを作成→実行する
  it("should be able to import resources", async () => {
    console.log(
      "9. Stack2のテンプレート(YAML)を作成して、変更セットを作成→実行する",
    );
    await cfnClient.send(
      new CreateChangeSetCommand({
        StackName: stackName2,
        ChangeSetName: "import",
        ChangeSetType: "IMPORT",
        ResourcesToImport: importJsonBody,
        TemplateBody: readFileSync(`${testdataDir}/Stack2.yml`).toString(),
      }),
    );
    await waitUntilChangeSetCreateComplete(
      { client: cfnClient, maxWaitTime: 300 },
      { StackName: stackName2, ChangeSetName: "import" },
    );

    await cfnClient.send(
      new ExecuteChangeSetCommand({
        StackName: stackName2,
        ChangeSetName: "import",
      }),
    );
    const result = await waitUntilStackImportComplete(
      { client: cfnClient, maxWaitTime: 300 },
      { StackName: stackName2 },
    );
    expect(result.state).toBe("SUCCESS");
  });
});

afterAll(async () => {
  console.log("(後処理) Stackを削除する");
  await cfnClient.send(new DeleteStackCommand({ StackName: stackName1 }));
  await waitUntilStackDeleteComplete(
    { client: cfnClient, maxWaitTime: 300 },
    { StackName: stackName1 },
  );
  await cfnClient.send(new DeleteStackCommand({ StackName: stackName2 }));
  await waitUntilStackDeleteComplete(
    { client: cfnClient, maxWaitTime: 300 },
    { StackName: stackName2 },
  );
});

# cfn-refactory

CloudFormation のリファクタリングを支援する簡易的なツールです。

> [!CAUTION]
> これは実験的なプロジェクトです。本番環境での利用は想定されていません。
>
> This is an experimental project. Not intended to use in production environment.

## 機能

### generate-import-json

[CloudFormation Resource Import](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-import-existing-stack.html#resource-import-existing-stack-cli) で使用するためのJSONファイルを既存のCloudFormationスタックから生成します。

```sh
npx cfn-refactory generate-import-json MyStack --out MyStack.import.json
```

### inject-policy

CloudFormation Resource Importの前提条件として必要な `DeletionPolicy` をすべてのリソースに埋め込みます。

```sh
npx cfn-refactory inject-policy MyStack.json --out MyStack.retain.json
```

> [!TIP]
> 対象のテンプレートはJSON形式である必要があります。YAMLからJSONへの変換には [aws-cloudformation/rain](https://github.com/aws-cloudformation/rain) が利用可能です。
>
> ```sh
> rain fmt --json MyStack.yaml > MyStack.json
> ```

## リファクタリングのシナリオ

2つのSQS Queueと1つのS3 BucketをもつStack1から、**Stack2を新しく作成**して2つのリソースを移動させる場合の手順はこのようになります。これは [integ test](./test/integ.import.ts) に実装されており、 `npm run integ` コマンドで再現することができます。

> [!IMPORTANT]
> シナリオの実行には以下が必要です。
>
> - [aws-cloudformation/rain](https://github.com/aws-cloudformation/rain)
> - AWS CLI の認証情報が正しく設定されていること

1. (準備) Stack1のテンプレート(YAML)を作成してデプロイする
   - `rain deploy Stack1.before.yml Stack1`
   - サンプルテンプレート: [Stack1.before.yml](./testdata/Stack1.before.yml)
1. Stack1のすべてのスタックリソースを含む、インポート用のJSONを生成する
   - `npx cfn-refactory generate-import-json Stack1 --out Stack1.import.json`
1. Stack1のテンプレート(YAML)をJSONに変換する
   - `rain fmt --json Stack1.before.yml > Stack1.before.json`
1. Stack1のテンプレート(JSON)に含まれるすべてのリソースに `DeletionPolicy` を設定する
   - `npx cfn-refactory inject-policy Stack1.before.json --out Stack1.retain.json`
1. Stack1をテンプレート(JSON)で更新して、`DeletionPolicy` を反映する
   - `rain deploy Stack1.retain.json Stack1`
1. Stack1のテンプレート(JSON)から移動させるリソースを削除する
   - 手動操作。移動させ**ない**リソースの `DeletionPolicy` に変更がないなら、YAMLを編集してもよい
   - サンプルテンプレート: [Stack1.after.yml](./testdata/Stack1.after.yml)
1. Stack1をテンプレート(JSON)で更新して、移動させるリソースを削除する (`DELETE_SKIP`)
   - `rain deploy Stack1.after.yml Stack1`
1. インポート用のJSONから、移動させ**ない**リソースを削除する
   - 手動操作
1. Stack2のテンプレート(YAML)を作成して、変更セットを作成→実行する
   - 下記コマンドを参照
   - サンプルテンプレート: [Stack2.yml](./testdata/Stack2.yml)
1. Stack2のドリフト検出を実行する

```sh
aws cloudformation create-change-set \
    --stack-name Stack2 \
    --change-set-name ImportChangeSet \
    --change-set-type IMPORT \
    --resources-to-import file://Stack1.import.json \
    --template-body file://Stack2.yml
aws cloudformation execute-change-set \
    --stack-name Stack2 \
    --change-set-name ImportChangeSet
```

> [!TIP]
> 変更セットの `ChangeSetType: "IMPORT"` を使用してリソースインポートを行う場合、インポート以外のリソース操作は同時に行えません。
>
> - 既存のスタックにインポートする場合、インポートするリソース以外に変更が発生しないことを確認してください。
> - `Output` セクションなどの変更も許容されないため、インポートするリソースに依存する変更は、インポート完了後に再度スタックを更新してください。
>
>   インポート以外のリソース操作を同時に行うには `ChangeSetType: "CREATE"`または `ChangeSetType: "UPDATE"` と `ImportExistingResources` を組み合わせる必要があります。この場合はリソースに物理名の指定が必要となるため、物理名を指定したくない場合には使用できません。

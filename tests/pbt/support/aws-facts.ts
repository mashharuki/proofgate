/**
 * AWSの事実（データだけ）を、独立オラクルへ渡す入口です（spec proofgate-brushup, Step 2）。
 * AWS Service Referenceから生成した表を、そのまま再エクスポートします。ロジックは持ちません。
 * 評価器のコード（マッチャー）は使いません。表の中身は`tests/aws-tables.test.ts`が、AWSのドキュメントで読んだ値と照らして確かめます。
 * The only way for the independent oracle to read AWS facts: the tables generated from the AWS Service
 * Reference, re-exported as data. No logic, no matcher of the evaluator.
 */
export {
  BUCKET_GRANT_ACTIONS,
  LAUNCH_ACTIONS,
  OBJECT_ACTIONS,
} from "../../../packages/core/src/aws-tables.generated.js";

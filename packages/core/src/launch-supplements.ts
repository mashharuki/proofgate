/**
 * 起動アクションの表への手書きの補足です（spec proofgate-brushup, Step 7 の測定から）。
 * 生成した表（`aws-tables.generated.ts`）は、AWS Service Referenceの`iam:PassedToService`の値をそのまま写します。
 * ところが、渡されるロールが信頼するサービスプリンシパルは、その値と違うことがあります。ここには、AWSのドキュメントで
 * 確認した場合だけ、そのずれを足します。生成した表にあるアクションにだけ足せます（テストで確認します）。足すのは信頼先だけで、
 * 起動アクションは増やしません。指摘が増える方向だけの変更です。
 *
 * Hand-written additions to the generated launch table. The Service Reference gives the `iam:PassedToService` value, but the
 * role that is passed may trust another service principal. An entry is added only after the AWS documentation or a path of
 * the pathfinding.cloud dataset confirmed it. It only adds trusted services of actions that already are in the table.
 */
export const LAUNCH_SUPPLEMENTS: Readonly<Record<string, readonly string[]>> = {
  // pathfinding.cloud gamelift-001: the instance role of a fleet is assumed by EC2 instances. The CreateFleet API reference
  // (InstanceRoleArn, read 2026-11-22): any application that runs on an instance of the fleet can assume the role.
  // The table says gamelift.amazonaws.com. The trust principal of the instance role is ec2.amazonaws.com in the dataset.
  "gamelift:createfleet": ["ec2.amazonaws.com"],
  // App Runner: the instance role trusts tasks.apprunner.amazonaws.com and the access role trusts
  // build.apprunner.amazonaws.com (App Runner developer guide, "Identity and access management", read 2026-11-22).
  // The table says bullet.amazonaws.com for both actions.
  "apprunner:createservice": ["tasks.apprunner.amazonaws.com", "build.apprunner.amazonaws.com"],
  "apprunner:updateservice": ["tasks.apprunner.amazonaws.com", "build.apprunner.amazonaws.com"],
};

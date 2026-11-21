import type { StatementModel, UnsupportedFinding } from "@proofgate-cdk/model";

/**
 * AWS管理ポリシーの表です（spec proofgate-cdk-construct-support, R2）。
 * 表に載せるのは、AWSのドキュメントで内容を確認したポリシーだけです。表にないポリシーは未対応（PG-IAM-003）です。
 * Managed policies that were checked against the AWS documentation. Any other managed policy stays unsupported.
 *
 * AWSLambdaBasicExecutionRole: policy version v1, ARN arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole.
 * The only statement is Allow of logs:CreateLogGroup, logs:CreateLogStream, and logs:PutLogEvents on "*".
 * Source: https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSLambdaBasicExecutionRole.html
 * Checked on 2026-11-19. AWS can publish a new default version later; this is a trust assumption (docs/ASSUMPTIONS.md).
 */
/**
 * AWSLambdaVPCAccessExecutionRole: policy version v3 (edited 2024-01-05), ARN arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole.
 * One Allow statement on "*": three logs actions and six ec2 network-interface actions.
 * Source: https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSLambdaVPCAccessExecutionRole.html (read 2026-11-21).
 *
 * AmazonAPIGatewayPushToCloudWatchLogs: policy version v1 (edited 2015-11-11), ARN arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs.
 * One Allow statement on "*": seven logs actions.
 * Source: https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonAPIGatewayPushToCloudWatchLogs.html (read 2026-11-21).
 * Neither policy touches S3 or iam:PassRole, so neither can create a path; they only make the role readable.
 */
const MANAGED_POLICIES: Readonly<
  Record<string, { readonly actions: readonly string[]; readonly resources: readonly string[] }>
> = {
  "service-role/AWSLambdaBasicExecutionRole": {
    actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
    resources: ["*"],
  },
  "service-role/AWSLambdaVPCAccessExecutionRole": {
    actions: [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "ec2:CreateNetworkInterface",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DescribeSubnets",
      "ec2:DeleteNetworkInterface",
      "ec2:AssignPrivateIpAddresses",
      "ec2:UnassignPrivateIpAddresses",
    ],
    resources: ["*"],
  },
  "service-role/AmazonAPIGatewayPushToCloudWatchLogs": {
    actions: [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
      "logs:PutLogEvents",
      "logs:GetLogEvents",
      "logs:FilterLogEvents",
    ],
    resources: ["*"],
  },
};

const UNSUPPORTED_REASON = "Managed policies are not supported in the first vertical slice";
const ARN_PREFIX = "arn:aws:iam::aws:policy/";
const PARTITION_WILDCARD_PREFIX = "arn:*:iam::aws:policy/";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * ManagedPolicyArnsの1要素を、ポリシー名（表のキー）にします。読めなければundefinedです。
 * 対応する形は2つだけです。リテラルのARN（パーティションはaws）と、
 * CDKが作る`Fn::Join ["", ["arn:", {Ref: AWS::Partition}, ":iam::aws:policy/<name>"]]`です。
 */
function policyNameOf(entry: unknown): string | undefined {
  let text: string | undefined;
  if (typeof entry === "string") {
    text = entry;
  } else if (isObject(entry) && Object.keys(entry).length === 1) {
    const join = entry["Fn::Join"];
    if (Array.isArray(join) && join.length === 2 && join[0] === "" && Array.isArray(join[1])) {
      const parts = join[1].map((part) => {
        if (typeof part === "string") return part;
        const ref = isObject(part) && Object.keys(part).length === 1 ? part.Ref : undefined;
        // パーティションは1つの実値より大きい`*`として読みます。それ以外のRefは読みません。
        return ref === "AWS::Partition" ? "*" : undefined;
      });
      if (parts.every((part): part is string => part !== undefined)) text = parts.join("");
    }
  }
  // CDKが書く`Fn::Sub "arn:${AWS::Partition}:iam::aws:policy/<name>"`。変数は`AWS::Partition`だけを許し、`*`と読みます（Joinと同じ）。
  // The Fn::Sub form CDK writes: only ${AWS::Partition} is allowed, read as "*" like the Join form. No variable map, no other `$`.
  if (isObject(entry) && Object.keys(entry).length === 1 && "Fn::Sub" in entry) {
    const raw = entry["Fn::Sub"];
    if (typeof raw === "string") {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CloudFormation Fn::Sub variable text
      const replaced = raw.replaceAll("${AWS::Partition}", "*");
      if (!replaced.includes("$")) text = replaced;
    }
  }
  if (text === undefined) return undefined;
  const prefix = [ARN_PREFIX, PARTITION_WILDCARD_PREFIX].find((candidate) =>
    text.startsWith(candidate),
  );
  if (prefix === undefined) return undefined;
  // 文字列のARNに*を書いた場合（arn:*:...）は、パーティションの`*`として読まれないよう、Joinの結果だけを許します。
  if (prefix === PARTITION_WILDCARD_PREFIX && typeof entry === "string") return undefined;
  const name = text.slice(prefix.length);
  return Object.hasOwn(MANAGED_POLICIES, name) ? name : undefined;
}

/**
 * ロールのManagedPolicyArnsを、Statementへ展開します。
 * 1つでも表にない要素があれば、元の理由でunsupportedとして記録し、空配列を返します（部分的な結果は返しません）。
 */
export function parseManagedPolicies(
  value: unknown,
  path: string,
  unsupported: UnsupportedFinding[],
): StatementModel[] {
  const names = Array.isArray(value) ? value.map(policyNameOf) : undefined;
  if (names === undefined || names.some((name) => name === undefined)) {
    unsupported.push({ sourcePath: path, reason: UNSUPPORTED_REASON });
    return [];
  }
  return names.flatMap((name, index) => {
    const policy = MANAGED_POLICIES[name as string];
    return policy === undefined
      ? []
      : [
          {
            effect: "Allow" as const,
            actions: [...policy.actions],
            resources: [...policy.resources],
            sourcePath: `${path}[${index}]`,
          },
        ];
  });
}

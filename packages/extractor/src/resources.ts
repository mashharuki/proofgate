import type { ResourceModel, RoleModel } from "@proofgate-cdk/model";
import { type ResolveContext, resolveValue } from "./resolve.js";
import { ROLE_BEARING } from "./role-bearing.js";

/**
 * ロールで動くリソース（Lambda関数、CodeBuildプロジェクト、Step Functionsのステートマシン）を読みます
 * （spec proofgate-implicit-role-paths, 設計2と3）。このリソースを変更できる主体は、`iam:PassRole`なしで、そのロールで
 * コードを動かせます。ロールを特定できないときは推測せず、`roleUnknown`にします。拒否するかどうかは評価側が決めます。
 * Reads the role-bearing resources. A role that cannot be identified is never guessed: `roleUnknown`.
 */
type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const ROLE_ARN = /^arn:(?:aws|aws-cn|aws-us-gov):iam::[^:]*:role\/(.+)$/;
/** ロールの値から、テンプレート内のロールを特定します。特定できなければundefinedです。 */
function identifyRole(
  value: unknown,
  roles: ReadonlyMap<string, RoleModel>,
  context: ResolveContext,
): string | undefined {
  if (isObject(value) && Object.keys(value).length === 1 && "Fn::GetAtt" in value) {
    const target = value["Fn::GetAtt"];
    if (Array.isArray(target) && target.length === 2 && target[1] === "Arn") {
      const id = target[0];
      return typeof id === "string" && roles.has(id) ? id : undefined;
    }
    return undefined;
  }
  const alternatives = resolveValue(value, context);
  if (alternatives === undefined || alternatives.length === 0) return undefined;
  const found = new Set<string>();
  for (const alternative of alternatives) {
    const name = ROLE_ARN.exec(alternative)?.[1];
    if (name === undefined) return undefined;
    const match = [...roles.values()].find(
      (role) => (role.roleName ?? `_generated_${role.logicalId}`) === name,
    );
    if (match === undefined) return undefined;
    found.add(match.logicalId);
  }
  return found.size === 1 ? [...found][0] : undefined;
}
export function parseRoleBearingResources(
  resources: Readonly<Record<string, unknown>>,
  roles: ReadonlyMap<string, RoleModel>,
  context: ResolveContext,
): ResourceModel[] {
  const found: ResourceModel[] = [];
  for (const [logicalId, raw] of Object.entries(resources)) {
    if (!isObject(raw) || typeof raw.Type !== "string") continue;
    const bearing = Object.hasOwn(ROLE_BEARING, raw.Type) ? ROLE_BEARING[raw.Type] : undefined;
    if (bearing === undefined) continue;
    const properties = isObject(raw.Properties) ? raw.Properties : {};
    const rawName = properties[bearing.nameProperty];
    const roleLogicalId = identifyRole(properties[bearing.roleProperty], roles, context);
    found.push({
      logicalId,
      kind: bearing.kind,
      ...(typeof rawName === "string" && rawName.length > 0 ? { name: rawName } : {}),
      ...(rawName !== undefined && !(typeof rawName === "string" && rawName.length > 0)
        ? { nameUnknown: true }
        : {}),
      ...(roleLogicalId === undefined ? { roleUnknown: true } : { roleLogicalId }),
      sourcePath: `Resources.${logicalId}.Properties.${bearing.roleProperty}`,
    });
  }
  return found.sort((a, b) => a.logicalId.localeCompare(b.logicalId));
}

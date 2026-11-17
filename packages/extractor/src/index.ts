import type { ExtractionResult, RoleModel, StatementModel, UnsupportedFinding } from "@proofgate/model";

type JsonObject = Record<string, unknown>;

const object = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] | undefined =>
  typeof value === "string" ? [value] : Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : undefined;

function parseStatements(document: unknown, path: string, unsupported: UnsupportedFinding[]): StatementModel[] {
  if (!object(document) || !Array.isArray(document.Statement)) {
    unsupported.push({ sourcePath: path, reason: "PolicyDocument.Statement must be an array" });
    return [];
  }

  return document.Statement.flatMap((raw, index) => {
    const sourcePath = `${path}.Statement[${index}]`;
    if (!object(raw)) {
      unsupported.push({ sourcePath, reason: "Statement must be an object" });
      return [];
    }
    for (const key of ["NotAction", "NotResource", "Condition"] as const) {
      if (key in raw) unsupported.push({ sourcePath: `${sourcePath}.${key}`, reason: `${key} is not supported` });
    }
    const actions = strings(raw.Action);
    const resources = strings(raw.Resource);
    if (!actions || !resources) {
      unsupported.push({ sourcePath, reason: "Action and Resource must be literal strings or arrays of strings" });
      return [];
    }
    if (raw.Effect !== "Allow" && raw.Effect !== "Deny") {
      unsupported.push({ sourcePath: `${sourcePath}.Effect`, reason: "Effect must be Allow or Deny" });
      return [];
    }
    return [{ effect: raw.Effect, actions, resources, sourcePath }];
  });
}

function parseTrustServices(document: unknown, path: string, unsupported: UnsupportedFinding[]): string[] {
  if (!object(document) || !Array.isArray(document.Statement)) {
    unsupported.push({ sourcePath: path, reason: "AssumeRolePolicyDocument.Statement must be an array" });
    return [];
  }

  const services: string[] = [];
  document.Statement.forEach((raw, index) => {
    const sourcePath = `${path}.Statement[${index}]`;
    if (!object(raw)) {
      unsupported.push({ sourcePath, reason: "Trust statement must be an object" });
      return;
    }
    for (const key of ["NotAction", "NotPrincipal", "Condition"] as const) {
      if (key in raw) unsupported.push({ sourcePath: `${sourcePath}.${key}`, reason: `${key} is not supported in trust policies` });
    }
    const actions = strings(raw.Action);
    if (!actions) {
      unsupported.push({ sourcePath: `${sourcePath}.Action`, reason: "Trust policy Action must contain literal strings" });
      return;
    }
    if (raw.Effect !== "Allow" && raw.Effect !== "Deny") {
      unsupported.push({ sourcePath: `${sourcePath}.Effect`, reason: "Trust policy Effect must be Allow or Deny" });
      return;
    }
    if (raw.Effect !== "Allow" || !actions.some((action) => ["*", "sts:*", "sts:assumerole"].includes(action.toLowerCase()))) return;
    if (raw.Principal === "*") {
      services.push("*");
      return;
    }
    if (!object(raw.Principal)) {
      unsupported.push({ sourcePath: `${sourcePath}.Principal`, reason: "Trust policy Principal must be a literal object or *" });
      return;
    }
    for (const [principalType, values] of Object.entries(raw.Principal)) {
      const parsed = strings(values);
      if (!parsed) {
        unsupported.push({ sourcePath: `${sourcePath}.Principal.${principalType}`, reason: "Trust principals must contain literal strings" });
      } else if (principalType === "Service") {
        services.push(...parsed.map((service) => service.toLowerCase()));
      }
    }
  });
  return [...new Set(services)].sort();
}

export function extractStack(template: unknown): ExtractionResult {
  const unsupported: UnsupportedFinding[] = [];
  if (!object(template) || !object(template.Resources)) {
    return { unsupported: [{ sourcePath: "Resources", reason: "CloudFormation Resources object is required" }] };
  }

  const roles = new Map<string, RoleModel>();
  for (const [logicalId, rawResource] of Object.entries(template.Resources)) {
    if (object(rawResource) && rawResource.Type === "AWS::IAM::ManagedPolicy") {
      unsupported.push({ sourcePath: `Resources.${logicalId}`, reason: "AWS::IAM::ManagedPolicy is not supported in the first vertical slice" });
      continue;
    }
    if (object(rawResource) && typeof rawResource.Type === "string" && rawResource.Type.startsWith("AWS::IAM::") && !["AWS::IAM::Role", "AWS::IAM::Policy"].includes(rawResource.Type)) {
      unsupported.push({ sourcePath: `Resources.${logicalId}`, reason: `${rawResource.Type} is not supported in the first vertical slice` });
      continue;
    }
    if (!object(rawResource) || rawResource.Type !== "AWS::IAM::Role" || !object(rawResource.Properties)) continue;
    const statements: StatementModel[] = [];
    const trustPath = `Resources.${logicalId}.Properties.AssumeRolePolicyDocument`;
    const trustServices = parseTrustServices(rawResource.Properties.AssumeRolePolicyDocument, trustPath, unsupported);
    const policies = rawResource.Properties.Policies;
    if (policies !== undefined) {
      if (!Array.isArray(policies)) {
        unsupported.push({ sourcePath: `Resources.${logicalId}.Properties.Policies`, reason: "Policies must be an array" });
      } else {
        policies.forEach((policy, index) => {
          const path = `Resources.${logicalId}.Properties.Policies[${index}].PolicyDocument`;
          if (!object(policy)) unsupported.push({ sourcePath: path, reason: "Inline policy must be an object" });
          else statements.push(...parseStatements(policy.PolicyDocument, path, unsupported));
        });
      }
    }
    if (rawResource.Properties.ManagedPolicyArns !== undefined) {
      unsupported.push({ sourcePath: `Resources.${logicalId}.Properties.ManagedPolicyArns`, reason: "Managed policies are not supported in the first vertical slice" });
    }
    if (rawResource.Properties.RoleName !== undefined && typeof rawResource.Properties.RoleName !== "string") {
      unsupported.push({ sourcePath: `Resources.${logicalId}.Properties.RoleName`, reason: "RoleName must be a literal string when present" });
    }
    if (rawResource.Properties.Path !== undefined && rawResource.Properties.Path !== "/") {
      unsupported.push({ sourcePath: `Resources.${logicalId}.Properties.Path`, reason: "Non-default IAM role paths are not supported in the first vertical slice" });
    }
    const roleName = typeof rawResource.Properties.RoleName === "string" ? rawResource.Properties.RoleName : undefined;
    roles.set(logicalId, { logicalId, roleName, trustServices, statements });
  }

  for (const [logicalId, rawResource] of Object.entries(template.Resources)) {
    if (!object(rawResource) || rawResource.Type !== "AWS::IAM::Policy" || !object(rawResource.Properties)) continue;
    const path = `Resources.${logicalId}.Properties.PolicyDocument`;
    const statements = parseStatements(rawResource.Properties.PolicyDocument, path, unsupported);
    const roleRefs = rawResource.Properties.Roles;
    if (!Array.isArray(roleRefs)) {
      unsupported.push({ sourcePath: `Resources.${logicalId}.Properties.Roles`, reason: "Policy Roles must be an array" });
      continue;
    }
    for (const [index, roleRef] of roleRefs.entries()) {
      if (!object(roleRef) || typeof roleRef.Ref !== "string" || !roles.has(roleRef.Ref)) {
        unsupported.push({ sourcePath: `Resources.${logicalId}.Properties.Roles[${index}]`, reason: "Only local role Ref targets are supported" });
        continue;
      }
      const role = roles.get(roleRef.Ref)!;
      roles.set(role.logicalId, { ...role, statements: [...role.statements, ...statements] });
    }
  }

  if (roles.size === 0) unsupported.push({ sourcePath: "Resources", reason: "No IAM roles were found; refusing a vacuous proof" });
  if ([...roles.values()].every((role) => role.statements.length === 0)) {
    unsupported.push({ sourcePath: "Resources", reason: "No supported IAM policy statements were found; refusing a vacuous proof" });
  }
  return unsupported.length > 0 ? { unsupported } : { model: { version: "1", roles: [...roles.values()].sort((a, b) => a.logicalId.localeCompare(b.logicalId)) }, unsupported };
}

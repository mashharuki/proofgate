import { describe, expect, it } from "vitest";
import {
  BUCKET_GRANT_ACTIONS,
  LAUNCH_ACTIONS,
  OBJECT_ACTIONS,
} from "../packages/core/src/aws-tables.generated.js";

// spec proofgate-brushup, Step 1: spot values of the tables generated from the AWS Service Reference.
// The expected values were read on the AWS documentation pages (Service Authorization Reference for
// Amazon S3 and Amazon ECS, the Lambda API reference, read 2026-11-20 and 2026-11-21), not from the
// generated file, so a broken extraction cannot pass.
// AWS Service Referenceから生成した表の、代表的な値を確かめます。期待値はAWSのドキュメントから書いています。
describe("generated AWS tables", () => {
  it("lists the 44 actions that take the S3 object resource, among them the ones that 1.1.2 missed", () => {
    expect(OBJECT_ACTIONS).toHaveLength(44);
    for (const action of [
      "s3:getobject",
      "s3:putobject",
      "s3:deleteobject",
      "s3:getobjectversion",
      "s3:deleteobjectversion",
      "s3:putobjectacl",
      "s3:putobjectversionacl",
      "s3:replicateobject",
      "s3:restoreobject",
      "s3:abortmultipartupload",
    ]) {
      expect(OBJECT_ACTIONS, action).toContain(action);
    }
    expect(OBJECT_ACTIONS).not.toContain("s3:listbucket");
    expect(OBJECT_ACTIONS).not.toContain("s3:putbucketpolicy");
  });
  it("lists the bucket actions that can give someone else access, and replication and lifecycle", () => {
    expect([...BUCKET_GRANT_ACTIONS].sort()).toEqual([
      "s3:deletebucketpolicy",
      "s3:putbucketacl",
      "s3:putbucketownershipcontrols",
      "s3:putbucketpolicy",
      "s3:putbucketpublicaccessblock",
      "s3:putlifecycleconfiguration",
      "s3:putreplicationconfiguration",
    ]);
  });
  it("maps launch actions to the service that gets the role", () => {
    const expected: Record<string, string[]> = {
      "lambda:createfunction": ["lambda.amazonaws.com"],
      "lambda:updatefunctionconfiguration": ["lambda.amazonaws.com"],
      "ecs:runtask": ["ecs-tasks.amazonaws.com", "ecs.amazonaws.com"],
      "ecs:starttask": ["ecs-tasks.amazonaws.com", "ecs.amazonaws.com"],
      "ecs:createservice": ["ecs-tasks.amazonaws.com", "ecs.amazonaws.com"],
      // The Service Authorization Reference for Amazon ECS: RegisterTaskDefinition passes the role to ecs-tasks only.
      "ecs:registertaskdefinition": ["ecs-tasks.amazonaws.com"],
      "ec2:runinstances": ["ec2.amazonaws.com"],
      "codebuild:createproject": ["codebuild.amazonaws.com"],
      "cloudformation:createstack": ["cloudformation.amazonaws.com"],
      "states:createstatemachine": ["states.amazonaws.com"],
      "glue:createjob": ["glue.amazonaws.com"],
      "s3:putreplicationconfiguration": ["s3.amazonaws.com"],
    };
    for (const [action, services] of Object.entries(expected)) {
      expect(LAUNCH_ACTIONS[action], action).toEqual(services);
    }
  });
  it("does not count actions that only read, tag, or pass the role itself", () => {
    // lambda:UpdateFunctionCode cannot change the role of a function (PR #10), invoking is not launching,
    // and iam:PassRole itself would make every PassRole holder a launcher of EC2.
    // Found with the AWS MCP Server on 2026-11-21: the first generation rule also took read and list actions
    // that a PassRole operation only depends on (lambda:GetLayerVersion, glue:GetJob, cloudformation:GetResource),
    // which would have made a holder of GetLayerVersion a "launcher" of Lambda.
    for (const action of [
      "lambda:updatefunctioncode",
      "lambda:invokefunction",
      "lambda:getlayerversion",
      "iam:passrole",
      "iam:createrole",
      "ecs:tagresource",
      "ecs:describetasks",
      "ecs:createcluster",
      "glue:getjob",
      "glue:getjobs",
      "cloudformation:getresource",
      "cloudformation:listresources",
      "states:revealsecrets",
    ]) {
      expect(LAUNCH_ACTIONS, action).not.toHaveProperty(action);
    }
    const tagging = Object.keys(LAUNCH_ACTIONS).filter((key) => /:(un)?tag/.test(key));
    expect(tagging).toEqual([]);
  });
  it("keeps every key and value lower case, and every key as service:action", () => {
    for (const [key, services] of Object.entries(LAUNCH_ACTIONS)) {
      expect(key, key).toBe(key.toLowerCase());
      expect(key, key).toMatch(/^[a-z0-9-]+:[a-z0-9*]+$/);
      expect(services.length, key).toBeGreaterThan(0);
      for (const service of services) expect(service, key).toBe(service.toLowerCase());
    }
  });
  it("reads an action without a passed-to service as any service", () => {
    expect(LAUNCH_ACTIONS["cognito-idp:createuserpool"]).toEqual(["*"]);
    expect(LAUNCH_ACTIONS["codebuild:createfleet"]).toEqual(["*"]);
  });
  it("is large enough to be a real extraction", () => {
    expect(Object.keys(LAUNCH_ACTIONS).length).toBeGreaterThan(800);
  });

  // Independent expectations. The lists below were copied from the Amazon S3 User Guide page "Required
  // permissions for Amazon S3 API operations" (using-with-s3-policy-actions.html), read through the AWS MCP
  // Server on 2026-11-21. That page is written by the S3 team and does not come from the Service Reference.
  const GUIDE_OBJECT_OPERATIONS = [
    "AbortMultipartUpload",
    "PutObject",
    "GetObject",
    "GetObjectVersion",
    "DeleteObject",
    "DeleteObjectVersion",
    "BypassGovernanceRetention",
    "DeleteObjectTagging",
    "DeleteObjectVersionTagging",
    "GetObjectTagging",
    "GetObjectVersionTagging",
    "GetObjectLegalHold",
    "GetObjectRetention",
    "GetObjectAcl",
    "GetObjectVersionAcl",
    "ListMultipartUploadParts",
    "PutObjectAcl",
    "PutObjectVersionAcl",
    "PutObjectLegalHold",
    "PutObjectRetention",
    "PutObjectTagging",
    "PutObjectVersionTagging",
    "RestoreObject",
    "UpdateObjectEncryption",
  ];
  it("contains every object operation that the S3 User Guide lists", () => {
    // ListBucketMultipartUploads is listed there too, but it takes the bucket resource (a listing of uploads).
    for (const name of GUIDE_OBJECT_OPERATIONS)
      expect(OBJECT_ACTIONS, name).toContain(`s3:${name.toLowerCase()}`);
    expect(OBJECT_ACTIONS).not.toContain("s3:listbucketmultipartuploads");
  });
  const GUIDE_BUCKET_OPERATIONS = [
    "PutBucketAcl",
    "PutBucketOwnershipControls",
    "PutBucketPolicy",
    "DeleteBucketPolicy",
    "PutBucketPublicAccessBlock",
    "PutReplicationConfiguration",
    "PutLifecycleConfiguration",
  ];
  it("counts as bucket grant actions only actions that the S3 User Guide lists as bucket operations", () => {
    expect([...BUCKET_GRANT_ACTIONS].sort()).toEqual(
      GUIDE_BUCKET_OPERATIONS.map((n) => `s3:${n.toLowerCase()}`).sort(),
    );
  });
  it("does not count the other write operations on the bucket (a documented judgment)", () => {
    // They change settings but neither give access to the objects nor copy or expire them: notifications,
    // inventory and analytics reports (key names only), logging, versioning, encryption, CORS, website, delete.
    for (const name of [
      "PutBucketNotification",
      "PutInventoryConfiguration",
      "PutAnalyticsConfiguration",
      "PutBucketLogging",
      "PutBucketVersioning",
      "PutEncryptionConfiguration",
      "PutBucketCORS",
      "PutBucketWebsite",
      "DeleteBucket",
      "PutBucketObjectLockConfiguration",
      "PutAccelerateConfiguration",
      "PutBucketTagging",
    ]) {
      expect(BUCKET_GRANT_ACTIONS, name).not.toContain(`s3:${name.toLowerCase()}`);
    }
  });
});

// Launch supplements (packages/core/src/launch-supplements.ts): hand-written, so the test guards their shape.
// 手書きの補足は、生成した表にあるアクションにだけ、小文字のアクション名で足せます。
describe("launch supplements", () => {
  it("only extend actions that are in the generated table, with lower-case names", async () => {
    const { LAUNCH_SUPPLEMENTS } = await import("../packages/core/src/launch-supplements.js");
    for (const [action, services] of Object.entries(LAUNCH_SUPPLEMENTS)) {
      expect(action, action).toBe(action.toLowerCase());
      expect(Object.hasOwn(LAUNCH_ACTIONS, action), action).toBe(true);
      expect(services.length, action).toBeGreaterThan(0);
      for (const service of services)
        expect(service, action).toMatch(/^[a-z0-9.-]+\.amazonaws\.com$/);
    }
  });
});

// Implicit-use actions (packages/core/src/implicit-actions.ts): hand-written, so the test guards the shape of each entry.
// 手書きの表は、小文字のアクション名、出典のURL、確認した日付を持つ項目だけです。
describe("implicit-use actions", () => {
  it("has lower-case actions, a documentation URL, a date, and no duplicate", async () => {
    const { IMPLICIT_ACTIONS } = await import("../packages/core/src/implicit-actions.js");
    const seen = new Set<string>();
    for (const entry of IMPLICIT_ACTIONS) {
      expect(entry.action, entry.action).toBe(entry.action.toLowerCase());
      expect(entry.action, entry.action).toMatch(/^[a-z0-9-]+:[a-z0-9]+$/);
      expect(entry.source, entry.action).toMatch(/^https:\/\/docs\.aws\.amazon\.com\//);
      expect(entry.checked, entry.action).toMatch(/^2026-\d\d-\d\d$/);
      expect(entry.behavior.length, entry.action).toBeGreaterThan(0);
      expect(seen.has(entry.action), entry.action).toBe(false);
      seen.add(entry.action);
    }
    expect([...seen].sort()).toEqual([
      "codebuild:startbuild",
      "codebuild:startbuildbatch",
      "lambda:updatefunctioncode",
      "lambda:updatefunctionconfiguration",
      "states:updatestatemachine",
    ]);
  });
});

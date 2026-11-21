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
      "ecs:registertaskdefinition": ["ecs-tasks.amazonaws.com", "ecs.amazonaws.com"],
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
    for (const action of [
      "lambda:updatefunctioncode",
      "lambda:invokefunction",
      "iam:passrole",
      "iam:createrole",
      "ecs:tagresource",
      "ecs:describetasks",
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
    expect(Object.keys(LAUNCH_ACTIONS).length).toBeGreaterThan(900);
  });
});

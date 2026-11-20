import { Validations } from "aws-cdk-lib";
import { escalationPath, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 正解は危険です（RS-02と同じ経路）。スタックの作者が、CDKのacknowledgeでProofGateの指摘を抑止します。
 * 経路は同じテンプレートの中にありますが、検査される側が検査結果を消せるため、モデルの範囲外として扱います。
 */
export const rs14: Pattern = {
  id: "RS-14",
  title: "The author acknowledges the finding",
  description:
    "The escalation path of RS-02, and the author of the stack acknowledges the ProofGate finding with the acknowledge feature of CDK. The path is in the template, but the person who is checked can silence the check.",
  groundTruth: "unsafe",
  inScope: false,
  boundary: "acknowledged",
  build(app) {
    escalationPath(stackOf(app));
    Validations.of(app).acknowledge({
      id: "ProofGate::PG-IAM-004",
      reason: "Pattern RS-14 measures what the acknowledgement does; this is not a real exception.",
    });
  },
};

import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";
import { App, Validations } from "aws-cdk-lib";
import { catalog, selectPattern } from "./catalog.js";
import { PROTECTED_BUCKET_ARN } from "./config.js";
import { constructProbeCatalog } from "./construct-probe/catalog.js";
import { holdoutCatalog } from "./holdout/catalog.js";

export interface CreateAppOptions {
  /** trueなら、実際のProofGateValidatorを登録します。 */
  readonly gated: boolean;
  readonly outdir?: string;
  /** 指定しなければ、CDKのコンテキスト値`pattern`を使います。 */
  readonly pattern?: string;
}

/** 選んだPatternのスタックを持つAppを作ります。CLIの入口と、プロセス内のランナーが共用します。 */
export function createApp(options: CreateAppOptions): App {
  const app = new App(options.outdir === undefined ? {} : { outdir: options.outdir });
  const pattern = selectPattern(options.pattern ?? app.node.tryGetContext("pattern"), [
    ...catalog,
    ...holdoutCatalog,
    ...constructProbeCatalog,
  ]);
  pattern.build(app);
  if (options.gated) {
    Validations.of(app).addPlugins(
      new ProofGateValidator({ protectedBucketArns: [PROTECTED_BUCKET_ARN] }),
    );
  }
  return app;
}

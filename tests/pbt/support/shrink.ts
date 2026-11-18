/**
 * 失敗したCaseを、同じ失敗を保ったまま小さくする縮小器です（design 4.6）。
 *
 * - 縮小の各ステップは、有効なStackModelだけを候補にします。無効な候補は修復せず捨てます。
 * - 候補の採否は呼び出し側の`check`が決めます（元の不一致が残ることを確認する関数）。
 * - 最後に`confirm`で3者を再実行し、確認できた最小のCaseだけを報告します。
 * - 縮小中に残るStatementのsourcePathは変更しないため、witnessの参照は有効なままです。
 */
import type { ProofGateConfig, RoleModel, StackModel, StatementModel } from "@proofgate/model";

export interface Shrinkable {
  readonly model: StackModel;
  readonly config: ProofGateConfig;
}

/** 有効なStackModelか（ロール1つ以上、Statement1つ以上、保護バケット1つ以上）を判定します。 */
export function isValid(s: Shrinkable): boolean {
  const { roles } = s.model;
  if (roles.length === 0) return false;
  const statements = roles.flatMap((r) => r.statements);
  if (statements.length === 0) return false;
  if (
    statements.some(
      (st) =>
        st.actions.length === 0 ||
        st.resources.length === 0 ||
        [...st.actions, ...st.resources].some((v) => v.length === 0),
    )
  ) {
    return false;
  }
  const buckets = s.config.protectedBucketArns;
  return buckets.length > 0 && buckets.every((b) => b.trim().length > 0);
}

/** 縮小の大きさの目安です。ロール、Statement、action、resource、バケットの数の合計です。 */
export function sizeOf(s: Shrinkable): number {
  const statements = s.model.roles.flatMap((r) => r.statements);
  return (
    s.model.roles.length +
    statements.length +
    statements.reduce((n, st) => n + st.actions.length + st.resources.length, 0) +
    s.config.protectedBucketArns.length
  );
}

function withRoles(s: Shrinkable, roles: RoleModel[]): Shrinkable {
  return { model: { ...s.model, roles }, config: s.config };
}

function withStatement(
  s: Shrinkable,
  roleIndex: number,
  statementIndex: number,
  statement: StatementModel | undefined,
): Shrinkable {
  const roles = s.model.roles.map((role, i) => {
    if (i !== roleIndex) return role;
    const statements = role.statements.flatMap((st, j) =>
      j === statementIndex ? (statement === undefined ? [] : [statement]) : [st],
    );
    return { ...role, statements };
  });
  return withRoles(s, roles);
}

/** ワイルドカードより前の固定部分だけを残します。ワイルドカードがなければundefinedを返します。 */
function literalPrefix(value: string): string | undefined {
  const index = value.search(/[*?]/);
  return index < 0 ? undefined : value.slice(0, index);
}

/** 現在のCaseから1ステップで作れる、有効な縮小候補をすべて返します。 */
export function reductions(s: Shrinkable): Shrinkable[] {
  const out: Shrinkable[] = [];
  const { roles } = s.model;
  roles.forEach((_, i) => {
    out.push(
      withRoles(
        s,
        roles.filter((__, j) => j !== i),
      ),
    );
  });
  roles.forEach((role, i) => {
    role.statements.forEach((st, j) => {
      out.push(withStatement(s, i, j, undefined));
      st.actions.forEach((_, k) => {
        out.push(withStatement(s, i, j, { ...st, actions: st.actions.filter((__, m) => m !== k) }));
      });
      st.resources.forEach((_, k) => {
        out.push(
          withStatement(s, i, j, { ...st, resources: st.resources.filter((__, m) => m !== k) }),
        );
      });
      st.actions.forEach((value, k) => {
        const prefix = literalPrefix(value);
        if (prefix !== undefined) {
          const actions = st.actions.map((v, m) => (m === k ? prefix : v));
          out.push(withStatement(s, i, j, { ...st, actions }));
        }
      });
      st.resources.forEach((value, k) => {
        const prefix = literalPrefix(value);
        if (prefix !== undefined) {
          const resources = st.resources.map((v, m) => (m === k ? prefix : v));
          out.push(withStatement(s, i, j, { ...st, resources }));
        }
      });
    });
  });
  s.config.protectedBucketArns.forEach((_, i) => {
    out.push({
      model: s.model,
      config: {
        ...s.config,
        protectedBucketArns: s.config.protectedBucketArns.filter((__, j) => j !== i),
      },
    });
  });
  if (s.config.allowedPassRoleTargets !== undefined) {
    out.push({ model: s.model, config: { protectedBucketArns: s.config.protectedBucketArns } });
  }
  return out.filter(isValid);
}

export interface ShrinkOptions {
  /** 縮小ラウンドの最大数です（Lean絡みの不一致では8）。 */
  readonly maxRounds: number;
  /** 候補の一覧に対し、元の不一致が残るかを判定します（Leanが絡む場合は1回のバッチで評価します）。 */
  readonly check: (candidates: readonly Shrinkable[]) => boolean[];
  /** 最終確認です。O2、TypeScript、Leanを再実行して、元の不一致が残ることを確かめます。 */
  readonly confirm: (candidate: Shrinkable) => boolean;
}

export interface ShrinkResult {
  readonly result: Shrinkable;
  readonly rounds: number;
  /** 最終確認を通ったか。falseなら、確認できた最後のCaseも見つからず、元のCaseを返しています。 */
  readonly confirmed: boolean;
  readonly sizeBefore: number;
  readonly sizeAfter: number;
}

/** 貪欲に縮小し、最後に確認できた最小のCaseを返します。 */
export function shrink(start: Shrinkable, options: ShrinkOptions): ShrinkResult {
  const history: Shrinkable[] = [start];
  let current = start;
  let rounds = 0;
  while (rounds < options.maxRounds) {
    const candidates = reductions(current);
    if (candidates.length === 0) break;
    rounds += 1;
    const accepted = options.check(candidates).indexOf(true);
    if (accepted < 0) break;
    current = candidates[accepted] as Shrinkable;
    history.push(current);
  }
  // 最後の候補から順に確認し、確認できた最小のCaseを採用します。
  for (let i = history.length - 1; i >= 0; i--) {
    const candidate = history[i] as Shrinkable;
    if (options.confirm(candidate)) {
      return {
        result: candidate,
        rounds,
        confirmed: true,
        sizeBefore: sizeOf(start),
        sizeAfter: sizeOf(candidate),
      };
    }
  }
  return {
    result: start,
    rounds,
    confirmed: false,
    sizeBefore: sizeOf(start),
    sizeAfter: sizeOf(start),
  };
}

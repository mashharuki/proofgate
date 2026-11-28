import ProofGate.Glob
import ProofGate.Tables

/-!
# ProofGate.Spec

`PG-IAM-004`のPassRoleの経路を、AWSへのリクエストの文字列で書いた規則です（spec `proofgate-lean-evaluator`, design 4.2）。
「具体的な文字列（ロールのARN、オブジェクトのARN）が存在して、必要なAPI呼び出しがすべて許可される」と書き、パターン同士の
交差は使いません。判定の実装（`ProofGate.Eval`）はパターンの交差で計算し、主定理`findings_iff`が両者をつなぎます。

The `PG-IAM-004` PassRole path, written as AWS requests over concrete strings: some role identifier, object ARN, or bucket
ARN exists such that the requests are allowed. No pattern intersection appears here. The implementation computes with
intersection, and `findings_iff` connects the two.

Trusted input normalization done in TypeScript before the model reaches Lean (design 4.1, listed in `docs/PROOFS.md`):
patterns, role names, and bucket ARNs are lowercase; a trailing `/` of a bucket ARN is removed; regional service principals
are read as the global ones; for a protected bucket ARN with a wildcard, opaque names of unnamed buckets in Resources are
replaced by `*`; no policy string contains U+0000 (the extractor rejects it); a role's path is `/` (the extractor rejects
other paths, so a role ARN is `role/` followed by the name).
-/

namespace ProofGate.Spec
open ProofGate.Glob

inductive Effect where
  | allow
  | deny
  deriving Repr, DecidableEq

/-- A statement: effect, action patterns, resource patterns (compiled, lowercase). -/
structure Stmt where
  effect : Effect
  actions : List (List Tok)
  resources : List (List Tok)
  deriving Repr

/-- A role. `id` is the CloudFormation logical ID (identity of the role); `idLower` is it in lowercase (for matching). -/
structure Role where
  id : String
  idLower : String
  name : Option String
  trusts : List String
  stmts : List Stmt
  deriving Repr

/-- The model of one template: roles, protected bucket ARNs, and `allowedPassRoleTargets` (logical IDs). -/
structure Model where
  roles : List Role
  buckets : List String
  exempt : List String
  deriving Repr

/-- Logical IDs are unique. CloudFormation guarantees it; the main theorems assume it, and every certificate checks it. -/
def WellFormed (m : Model) : Prop := (m.roles.map (·.id)).Nodup

/-- Some Allow statement allows the action on the resource (in the same statement). Deny is ignored: a decided
over-approximation. -/
def Allowed (st : List Stmt) (action resource : List Char) : Prop :=
  ∃ s ∈ st, s.effect = .allow ∧ (∃ ap ∈ s.actions, Matches ap action) ∧ (∃ rp ∈ s.resources, Matches rp resource)

/-- Some Allow statement allows the action, on any resource. The launch resource is not checked: a decided
over-approximation (the evaluator ignores it). -/
def AllowedAction (st : List Stmt) (action : List Char) : Prop :=
  ∃ s ∈ st, s.effect = .allow ∧ ∃ ap ∈ s.actions, Matches ap action

/-- A run without a colon: the partition, region, and account of an ARN. -/
def NoColon (x : List Char) : Prop := ':' ∉ x

/-- The opaque name of an unnamed role, `_generated_<logical ID>` (lowercase), as the extractor writes references to it. -/
def opaqueName (t : Role) : List Char := "_generated_".toList ++ t.idLower.toList

/-- The names a role may have in an ARN. A named role has its name. An unnamed role has its opaque name, or a name that
CloudFormation chooses at deploy time, read as an unknown string with the reserved character U+0000 (which no policy
literal contains) and no colon (role names have none): only a wildcard in the name part of a pattern meets it. -/
def PossibleName (t : Role) (n : List Char) : Prop :=
  match t.name with
  | some name => n = name.toList
  | none => n = opaqueName t ∨ ('\u0000' ∈ n ∧ ':' ∉ n)

/-- What an `iam:PassRole` Resource may denote: an ARN of the role, or (decided over-approximation, IAM rejects both) its
bare name or its logical ID. -/
def RoleIdent (t : Role) (x : List Char) : Prop :=
  (∃ part reg acct n, NoColon part ∧ NoColon reg ∧ NoColon acct ∧ PossibleName t n ∧
      x = "arn:".toList ++ part ++ ":iam:".toList ++ reg ++ ":".toList ++ acct ++ ":role/".toList ++ n) ∨
  (∃ name, t.name = some name ∧ x = name.toList) ∨
  x = t.idLower.toList

/-- The flat launch table: (action, services). -/
def launchTable : List (String × List String) :=
  Tables.launchGroups.flatMap fun (pre, entries) => entries.map fun (n, svcs) => (pre ++ ":" ++ n, svcs)

/-- P can launch the service: an entry for the service, or an any-service entry (`"*"`), is allowed. -/
def CanLaunch (p : Role) (svc : String) : Prop :=
  ∃ e ∈ launchTable, (svc ∈ e.2 ∨ "*" ∈ e.2) ∧ AllowedAction p.stmts e.1.toList

/-- The target trusts the service, or trusts every service (`*`, a decided over-approximation). -/
def Trusts (t : Role) (svc : String) : Prop := svc ∈ t.trusts ∨ "*" ∈ t.trusts

/-- The target reaches the protected bucket: an object action on some object of the bucket, or a bucket-grant action on
the bucket itself. -/
def Reaches (t : Role) (b : String) : Prop :=
  (∃ a ∈ Tables.objectActions, ∃ key, Allowed t.stmts a.toList (b.toList ++ '/' :: key)) ∨
  (∃ a ∈ Tables.bucketGrantActions, Allowed t.stmts a.toList b.toList)

/-- The rule: P can pass T to a service that T trusts and that P can launch, and T reaches the protected bucket. T is not
P, and T is not in `allowedPassRoleTargets`. -/
def EscalatesTo (m : Model) (p t : Role) (b : String) : Prop :=
  t ∈ m.roles ∧ t.id ≠ p.id ∧ t.id ∉ m.exempt ∧
  (∃ x, RoleIdent t x ∧ Allowed p.stmts "iam:passrole".toList x) ∧
  (∃ svc, CanLaunch p svc ∧ Trusts t svc) ∧ Reaches t b

end ProofGate.Spec

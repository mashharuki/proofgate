import ProofGate.Eval

/-!
# ProofGate.Legacy

以前の実装の判定をLeanに写し、規則`EscalatesTo`の一部が成り立つのに、その判定が「なし」と言う例を証明します
（spec `proofgate-lean-evaluator`, design 5.4）。「主定理は、自分たちの以前の実装では成り立たなかった」ことの証拠です。

Earlier checks of ProofGate, written in Lean as they were in TypeScript, with models in which the rule holds but the old
check says no. Evidence that the main theorem `findings_iff` does not hold for our earlier implementations.

- `legacy_s3_unsound` (before 1.0, defect D1): the old S3 check matched the Resource pattern against the literal string
  `<bucket>/*`, so a grant on a prefix of the bucket was missed.
- `legacy_passrole_unsound` (up to 1.2.0, defect F1): the old PassRole check required the substring `:role/` in the
  Resource, so `arn:aws:iam::123456789012:*` was missed although it denotes the role.
-/

namespace ProofGate.Legacy
open ProofGate.Glob ProofGate.Spec ProofGate.Eval

/-! ## D1: the S3 check before 1.0 -/

/-- Before 1.0: a Resource pattern gave access to the bucket only if it matched the literal string `<bucket>/*`. -/
def oldReaches (rp : List Tok) (b : String) : Bool := globMatch rp (b.toList ++ "/*".toList)

def reportsReader : Role :=
  ⟨"Data", "data", some "data-role", ["lambda.amazonaws.com"],
    [⟨.allow, [compile "s3:getobject"], [compile "arn:aws:s3:::bkt/reports/*"]⟩]⟩

theorem legacy_s3_unsound :
    oldReaches (compile "arn:aws:s3:::bkt/reports/*") "arn:aws:s3:::bkt" = false ∧
      Reaches reportsReader "arn:aws:s3:::bkt" :=
  ⟨by decide, (reachesB_iff _ _).mp (by decide)⟩

/-! ## F1: the PassRole check up to 1.2.0 -/

/-- The part of a Resource up to and including the first `:role/`, if any. -/
def scopeOfRole : List Char → Option (List Char)
  | [] => none
  | c :: rest =>
    if ":role/".toList.isPrefixOf (c :: rest) then some ":role/".toList
    else (scopeOfRole rest).map (c :: ·)

/-- Up to 1.2.0 (`allowsPassRoleTarget`): a bare identifier, or else the pattern against `<scope>` followed by the role's
name, where the scope is the Resource up to `:role/`. Without `:role/`, never. -/
def oldPassResource (pat : String) (t : Role) : Bool :=
  ([t.idLower] ++ t.name.toList).any (fun i => globMatch (compile pat) i.toList) ||
    match scopeOfRole pat.toList with
    | none => false
    | some scope =>
      match t.name with
      | some nm => globMatch (compile pat) (scope ++ nm.toList)
      | none => (pat.toList.drop scope.length).any (fun c => c == '*' || c == '?') ||
          globMatch (compile pat) (scope ++ opaqueName t)

def dataRole : Role :=
  ⟨"Data", "data", some "data-role", ["lambda.amazonaws.com"],
    [⟨.allow, [compile "s3:getobject"], [compile "arn:aws:s3:::bkt/*"]⟩]⟩

def deployer : Role :=
  ⟨"Dev", "dev", some "dev-role", ["ec2.amazonaws.com"],
    [⟨.allow, [compile "iam:passrole"], [compile "arn:aws:iam::123456789012:*"]⟩,
     ⟨.allow, [compile "lambda:createfunction"], [compile "*"]⟩]⟩

theorem legacy_passrole_unsound :
    oldPassResource "arn:aws:iam::123456789012:*" dataRole = false ∧
      ∃ x, RoleIdent dataRole x ∧ Allowed deployer.stmts "iam:passrole".toList x :=
  ⟨by decide, (passB_iff deployer dataRole).mp (by decide)⟩

/-- The whole path is a finding of the current implementation, so the 1.2.0 check missed a real `PG-IAM-004` path. -/
theorem legacy_passrole_path :
    findings ⟨[dataRole, deployer], ["arn:aws:s3:::bkt"], []⟩ = [("Dev", "Data", "arn:aws:s3:::bkt")] := by
  decide +kernel

end ProofGate.Legacy

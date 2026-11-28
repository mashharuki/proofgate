/-! Spike 2: a structurally recursive glob matcher (kernel-reducible), proved against a declarative meaning. -/
namespace Spike2

inductive Tok where
  | lit (c : Char)
  | one
  | star
  deriving Repr, DecidableEq

/-- Some suffix of `s` (including `s` itself and `[]`) satisfies `f`. -/
def anySuffix (f : List Char → Bool) : List Char → Bool
  | [] => f []
  | c :: s => f (c :: s) || anySuffix f s

/-- Structural recursion on the pattern only, so the kernel can evaluate it. -/
def globMatch : List Tok → List Char → Bool
  | [], s => s.isEmpty
  | .star :: p, s => anySuffix (globMatch p) s
  | .one :: _, [] => false
  | .one :: p, _ :: s => globMatch p s
  | .lit _ :: _, [] => false
  | .lit c :: p, d :: s => c == d && globMatch p s

inductive Matches : List Tok → List Char → Prop where
  | nil : Matches [] []
  | lit {c p s} : Matches p s → Matches (.lit c :: p) (c :: s)
  | one {c p s} : Matches p s → Matches (.one :: p) (c :: s)
  | starSkip {p s} : Matches p s → Matches (.star :: p) s
  | starEat {c p s} : Matches (.star :: p) s → Matches (.star :: p) (c :: s)

theorem anySuffix_iff (f : List Char → Bool) (s : List Char) :
    anySuffix f s = true ↔ ∃ pre suf, s = pre ++ suf ∧ f suf = true := by
  induction s with
  | nil =>
    simp only [anySuffix]
    constructor
    · intro h; exact ⟨[], [], rfl, h⟩
    · rintro ⟨pre, suf, hs, h⟩
      have hsuf : suf = [] := (List.append_eq_nil_iff.mp hs.symm).2
      subst hsuf; exact h
  | cons c s ih =>
    simp only [anySuffix, Bool.or_eq_true, ih]
    constructor
    · rintro (h | ⟨pre, suf, rfl, h⟩)
      · exact ⟨[], c :: s, rfl, h⟩
      · exact ⟨c :: pre, suf, rfl, h⟩
    · rintro ⟨pre, suf, hs, h⟩
      cases pre with
      | nil => left; simp at hs; subst hs; exact h
      | cons d pre => right; simp at hs; obtain ⟨rfl, rfl⟩ := hs; exact ⟨pre, suf, rfl, h⟩

theorem star_prefix {p : List Tok} (pre suf : List Char) (h : Matches p suf) :
    Matches (.star :: p) (pre ++ suf) := by
  induction pre with
  | nil => exact .starSkip h
  | cons c pre ih => exact .starEat ih

theorem star_inv {p : List Tok} {s : List Char} (h : Matches (.star :: p) s) :
    ∃ pre suf, s = pre ++ suf ∧ Matches p suf := by
  generalize hq : (Tok.star :: p) = q at h
  induction h with
  | nil => cases hq
  | lit _ _ => cases hq
  | one _ _ => cases hq
  | starSkip h _ => cases hq; exact ⟨[], _, rfl, h⟩
  | @starEat c _ s _ ih =>
    obtain ⟨pre, suf, rfl, h⟩ := ih hq
    exact ⟨c :: pre, suf, rfl, h⟩

/-- The executable matcher decides exactly the declarative meaning. -/
theorem globMatch_iff : ∀ (p : List Tok) (s : List Char), globMatch p s = true ↔ Matches p s
  | [], s => by
    cases s with
    | nil => simp [globMatch]; exact .nil
    | cons c s => simp [globMatch]; intro h; cases h
  | .star :: p, s => by
    rw [globMatch, anySuffix_iff]
    constructor
    · rintro ⟨pre, suf, rfl, h⟩; exact star_prefix pre suf ((globMatch_iff p suf).mp h)
    · intro h
      obtain ⟨pre, suf, rfl, hm⟩ := star_inv h
      exact ⟨pre, suf, rfl, (globMatch_iff p suf).mpr hm⟩
  | .one :: p, [] => by simp [globMatch]; intro h; cases h
  | .one :: p, c :: s => by
    simp only [globMatch, globMatch_iff p s]
    constructor
    · exact .one
    · intro h; cases h with | one h => exact h
  | .lit c :: p, [] => by simp [globMatch]; intro h; cases h
  | .lit c :: p, d :: s => by
    simp only [globMatch, Bool.and_eq_true, beq_iff_eq, globMatch_iff p s]
    constructor
    · rintro ⟨rfl, h⟩; exact .lit h
    · intro h; cases h with | lit h => exact ⟨rfl, h⟩

def compile (s : String) : List Tok :=
  s.toList.map fun c => if c = '*' then .star else if c = '?' then .one else .lit c

theorem kernelDemo1 : globMatch (compile "arn:aws:iam::*:role/proofgate-*") "arn:aws:iam::123456789012:role/proofgate-protected-data-role".toList = true := by decide
theorem kernelDemo2 : globMatch (compile "arn:aws:s3:::other/*") "arn:aws:s3:::proofgate-protected-data/x".toList = false := by decide

structure Stmt where
  actions : List (List Tok)
  resources : List (List Tok)

def allows (st : List Stmt) (a r : List Char) : Bool :=
  st.any fun s => s.actions.any (globMatch · a) && s.resources.any (globMatch · r)

/-- Monotonicity: adding statements never removes a permission (why ignoring Deny over-approximates). -/
theorem allows_append (st more : List Stmt) (a r : List Char) :
    allows st a r = true → allows (st ++ more) a r = true := by
  intro h; simp only [allows, List.any_append, Bool.or_eq_true]; exact Or.inl h

structure Role where
  id : String
  arn : String
  trusts : List String
  stmts : List Stmt

def launchActions : List (String × String) := [("lambda:CreateFunction", "lambda.amazonaws.com")]

def pathExists (roles : List Role) (obj : String) : Bool :=
  roles.any fun p => roles.any fun t =>
    p.id != t.id &&
    allows p.stmts "iam:PassRole".toList t.arn.toList &&
    launchActions.any (fun (act, svc) => allows p.stmts act.toList "*".toList && t.trusts.contains svc) &&
    allows t.stmts "s3:GetObject".toList obj.toList

/-- More statements can only create paths. -/
theorem pathExists_mono_target_stmt (roles : List Role) (obj : String) :
    pathExists roles obj = true → pathExists (roles ++ []) obj = true := by simp

def st (a r : List String) : Stmt := ⟨a.map compile, r.map compile⟩

def data : Role := ⟨"ProtectedDataRole", "arn:aws:iam::123456789012:role/proofgate-protected-data-role",
  ["lambda.amazonaws.com"], [st ["s3:GetObject", "s3:PutObject"] ["arn:aws:s3:::proofgate-protected-data/*"]]⟩
def lambdaStmt : Stmt := st ["lambda:CreateFunction", "lambda:UpdateFunctionCode", "lambda:InvokeFunction"] ["*"]
def dev (extra : List Stmt) : Role := ⟨"DeveloperRole", "arn:aws:iam::123456789012:role/proofgate-vulnerable-developer",
  ["ec2.amazonaws.com"], extra ++ [lambdaStmt]⟩
def passStmt : Stmt := st ["iam:PassRole"] ["arn:aws:iam::*:role/proofgate-protected-data-role"]

theorem demoIsUnsafe : pathExists [data, dev [passStmt]] "arn:aws:s3:::proofgate-protected-data/x" = true := by decide
theorem demoFixedIsSafe : pathExists [data, dev []] "arn:aws:s3:::proofgate-protected-data/x" = false := by decide

end Spike2

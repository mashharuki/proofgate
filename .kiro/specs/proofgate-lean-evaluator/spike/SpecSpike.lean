/-! Spike 2: a structurally recursive glob matcher (kernel-reducible), proved against a declarative meaning. -/
namespace SpecSpike

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


/-! The rule as a statement about requests (concrete strings). No pattern intersection appears here. -/

structure Stmt where
  actions : List (List Tok)
  resources : List (List Tok)

/-- Some Allow statement allows this action on this resource (Deny is ignored: decided over-approximation). -/
def Allowed (st : List Stmt) (action resource : List Char) : Prop :=
  ∃ s ∈ st, (∃ ap ∈ s.actions, Matches ap action) ∧ (∃ rp ∈ s.resources, Matches rp resource)

structure Role where
  id : String
  name : String
  trusts : List String
  stmts : List Stmt

/-- The ARNs of a named role (any partition and account without a colon). -/
def RoleArn (t : Role) (arn : List Char) : Prop :=
  ∃ part acct : List Char, ':' ∉ part ∧ ':' ∉ acct ∧
    arn = "arn:".toList ++ part ++ ":iam::".toList ++ acct ++ ":role/".toList ++ t.name.toList

def ObjectOf (bucket obj : List Char) : Prop := ∃ key, obj = bucket ++ "/".toList ++ key

structure Launch where
  action : String
  service : String

def launchTable : List Launch := [⟨"lambda:createfunction", "lambda.amazonaws.com"⟩]
def objectActions : List String := ["s3:getobject"]

def EscalatesTo (roles : List Role) (p : Role) (bucket : List Char) : Prop :=
  ∃ t ∈ roles, t.id ≠ p.id ∧ ∃ e ∈ launchTable, ∃ arn launchRes obj : List Char,
    RoleArn t arn ∧ Allowed p.stmts "iam:passrole".toList arn ∧
    Allowed p.stmts e.action.toList launchRes ∧
    e.service ∈ t.trusts ∧
    ObjectOf bucket obj ∧ ∃ a ∈ objectActions, Allowed t.stmts a.toList obj

def m (s : String) : List Tok := compile s
theorem mt {p : String} {s : String} (h : globMatch (compile p) s.toList = true) : Matches (compile p) s.toList :=
  (globMatch_iff _ _).mp h

def bucket : List Char := "arn:aws:s3:::proofgate-protected-data".toList
def data (objPat : String) : Role := ⟨"Data", "data-role", ["lambda.amazonaws.com"], [⟨[m "s3:getobject"], [m objPat]⟩]⟩
def dev (passPat : String) : Role := ⟨"Dev", "dev-role", ["ec2.amazonaws.com"],
  [⟨[m "iam:passrole"], [m passPat]⟩, ⟨[m "lambda:createfunction"], [m "*"]⟩]⟩

/-- Build `Allowed` from one statement, with the matching checked by the proved matcher. -/
theorem allowed_of {st : List Stmt} {a r : String} (s : Stmt) (hs : s ∈ st) (ap rp : List Tok)
    (ha : ap ∈ s.actions) (hr : rp ∈ s.resources)
    (hma : globMatch ap a.toList = true) (hmr : globMatch rp r.toList = true) : Allowed st a.toList r.toList :=
  ⟨s, hs, ⟨ap, ha, (globMatch_iff _ _).mp hma⟩, ⟨rp, hr, (globMatch_iff _ _).mp hmr⟩⟩

def passSt (p : String) : Stmt := ⟨[m "iam:passrole"], [m p]⟩
def launchSt : Stmt := ⟨[m "lambda:createfunction"], [m "*"]⟩
def readSt (p : String) : Stmt := ⟨[m "s3:getobject"], [m p]⟩
def dataR (objPat : String) : Role := ⟨"Data", "data-role", ["lambda.amazonaws.com"], [readSt objPat]⟩
def devR (passPat : String) : Role := ⟨"Dev", "dev-role", ["ec2.amazonaws.com"], [passSt passPat, launchSt]⟩

/-- A witness for the rule, from concrete request strings. It does not use the finding algorithm. -/
theorem escalates_of (objPat passPat obj : String) (hobj : ObjectOf bucket obj.toList)
    (hpass : globMatch (m passPat) "arn:aws:iam::123456789012:role/data-role".toList = true)
    (hread : globMatch (m objPat) obj.toList = true) :
    EscalatesTo [dataR objPat, devR passPat] (devR passPat) bucket := by
  refine ⟨dataR objPat, by simp, by simp [dataR, devR], ⟨"lambda:createfunction", "lambda.amazonaws.com"⟩,
    by simp [launchTable], "arn:aws:iam::123456789012:role/data-role".toList, "x".toList, obj.toList,
    ⟨"aws".toList, "123456789012".toList, by decide, by decide, by simp [dataR]⟩, ?_, ?_, by simp [dataR], hobj, ?_⟩
  · exact allowed_of (passSt passPat) (by simp [devR]) (m "iam:passrole") (m passPat) (by simp [passSt]) (by simp [passSt]) (by decide) hpass
  · exact allowed_of launchSt (by simp [devR]) (m "lambda:createfunction") (m "*") (by simp [launchSt]) (by simp [launchSt]) (by decide) (by decide)
  · exact ⟨"s3:getobject", by simp [objectActions],
      allowed_of (readSt objPat) (by simp [dataR]) (m "s3:getobject") (m objPat) (by simp [readSt]) (by simp [readSt]) (by decide) hread⟩

/-- Witness 1 (RS-03 shape): a grant on a prefix of the bucket is an escalation. -/
theorem prefixGrantEscalates :
    EscalatesTo [dataR "arn:aws:s3:::proofgate-protected-data/reports/*", devR "arn:aws:iam::*:role/data-*"]
      (devR "arn:aws:iam::*:role/data-*") bucket :=
  escalates_of _ _ "arn:aws:s3:::proofgate-protected-data/reports/q1.csv" ⟨"reports/q1.csv".toList, by decide⟩
    (by decide) (by decide)

/-- Witness 2: PassRole on `arn:aws:iam::*:role*` (the real IAM engine allows it, observation P10) is an escalation
under the rule. ProofGate 1.2.0 does not report it: its PassRole check requires the literal `:role/`. -/
theorem passRoleWithoutRoleSlashEscalates :
    EscalatesTo [dataR "arn:aws:s3:::proofgate-protected-data/*", devR "arn:aws:iam::*:role*"]
      (devR "arn:aws:iam::*:role*") bucket :=
  escalates_of _ _ "arn:aws:s3:::proofgate-protected-data/k" ⟨"k".toList, by decide⟩ (by decide) (by decide)

/-- Witness 3: PassRole on `arn:aws:iam::*:*` is an escalation too; 1.2.0 misses it for the same reason. -/
theorem passRoleOnAllIamEscalates :
    EscalatesTo [dataR "arn:aws:s3:::proofgate-protected-data/*", devR "arn:aws:iam::*:*"]
      (devR "arn:aws:iam::*:*") bucket :=
  escalates_of _ _ "arn:aws:s3:::proofgate-protected-data/k" ⟨"k".toList, by decide⟩ (by decide) (by decide)

/-- The pre-1.0 S3 check: does the Resource pattern match the literal string `<bucket>/*`? -/
def oldReaches (resPat : String) : Bool := globMatch (compile resPat) (bucket ++ "/*".toList)

/-- The old check is unsound for the rule: it says no for a prefix grant that reaches an object. -/
theorem oldCheckMissesPrefixGrant :
    oldReaches "arn:aws:s3:::proofgate-protected-data/reports/*" = false ∧
    ∃ obj, ObjectOf bucket obj ∧ Matches (compile "arn:aws:s3:::proofgate-protected-data/reports/*") obj :=
  ⟨by decide, "arn:aws:s3:::proofgate-protected-data/reports/q1.csv".toList, ⟨"reports/q1.csv".toList, by decide⟩, mt (by decide)⟩

end SpecSpike

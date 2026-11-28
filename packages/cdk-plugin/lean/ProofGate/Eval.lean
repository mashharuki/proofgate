import ProofGate.Glob
import ProofGate.Tables
import ProofGate.Spec

/-!
# ProofGate.Eval

`PG-IAM-004`のPassRoleの経路を、パターンの照合と交差で計算する実装`findings`と、それが規則`EscalatesTo`（文字列で書いた
もの）と一致するための補題です（spec `proofgate-lean-evaluator`, design 5.3）。橋渡しは`intersect_iff`です。

The implementation `findings`, which computes the `PG-IAM-004` PassRole path with pattern matching and intersection, and the
lemmas that connect it with the rule `EscalatesTo` (written over strings). The bridge is `intersect_iff`.
-/

namespace ProofGate.Eval
open ProofGate.Glob ProofGate.Spec

/-- A literal pattern. -/
def lits (w : List Char) : List Tok := w.map .lit

/-! ## Basic matching facts -/

theorem matches_star (s : List Char) : Matches [.star] s := by
  have := sl_prefix (t := .star) (p := []) rfl s [] (fun _ _ => trivial) .nil
  simpa using this

theorem matches_nstar_iff (s : List Char) : Matches [.nstar] s ↔ ':' ∉ s := by
  constructor
  · intro h
    obtain ⟨pre, suf, rfl, hpre, hsuf⟩ := sl_inv (t := .nstar) rfl h
    cases hsuf
    simp only [List.append_nil]
    intro hc
    exact hpre ':' hc rfl
  · intro h
    have := sl_prefix (t := .nstar) (p := []) rfl s [] (fun c hc => by
      show c ≠ ':'
      intro e; subst e; exact h hc) .nil
    simpa using this

theorem matches_lits_append (w : List Char) (r : List Tok) (s : List Char) :
    Matches (lits w ++ r) s ↔ ∃ s2, s = w ++ s2 ∧ Matches r s2 := by
  rw [matches_append]
  constructor
  · rintro ⟨s1, s2, rfl, h1, h2⟩
    rw [lits, matches_lits] at h1
    exact ⟨s2, by rw [h1], h2⟩
  · rintro ⟨s2, rfl, h2⟩
    exact ⟨w, s2, rfl, (matches_lits w w).mpr rfl, h2⟩

theorem matches_nstar_append (r : List Tok) (s : List Char) :
    Matches ([.nstar] ++ r) s ↔ ∃ a s2, s = a ++ s2 ∧ ':' ∉ a ∧ Matches r s2 := by
  rw [matches_append]
  constructor
  · rintro ⟨s1, s2, rfl, h1, h2⟩
    exact ⟨s1, s2, rfl, (matches_nstar_iff s1).mp h1, h2⟩
  · rintro ⟨a, s2, rfl, ha, h2⟩
    exact ⟨a, s2, rfl, (matches_nstar_iff a).mpr ha, h2⟩

theorem matches_lits_iff (w s : List Char) : Matches (lits w) s ↔ s = w := matches_lits w s

/-! ## The bridge: a pattern meets an allowed resource -/

/-- Some Allow statement allows the action on some resource that the pattern `q` also matches. -/
def allowedB (st : List Stmt) (a : List Char) (q : List Tok) : Bool :=
  st.any fun s => s.effect == .allow && s.actions.any (fun ap => globMatch ap a) &&
    s.resources.any (fun rp => intersect rp q)

theorem allowedB_iff (st : List Stmt) (a : List Char) (q : List Tok) :
    allowedB st a q = true ↔ ∃ x, Matches q x ∧ Allowed st a x := by
  simp only [allowedB, List.any_eq_true, Bool.and_eq_true, beq_iff_eq]
  constructor
  · rintro ⟨s, hs, ⟨he, ap, hap, hm⟩, rp, hrp, hi⟩
    obtain ⟨x, hx1, hx2⟩ := (intersect_iff rp q).mp hi
    exact ⟨x, hx2, s, hs, he, ⟨ap, hap, (globMatch_iff ap a).mp hm⟩, rp, hrp, hx1⟩
  · rintro ⟨x, hq, s, hs, he, ⟨ap, hap, hm⟩, rp, hrp, hx⟩
    exact ⟨s, hs, ⟨he, ap, hap, (globMatch_iff ap a).mpr hm⟩, rp, hrp,
      (intersect_iff rp q).mpr ⟨x, hx, hq⟩⟩

/-- Some Allow statement allows the action (on any resource). -/
def allowedActionB (st : List Stmt) (a : List Char) : Bool :=
  st.any fun s => s.effect == .allow && s.actions.any (fun ap => globMatch ap a)

theorem allowedActionB_iff (st : List Stmt) (a : List Char) :
    allowedActionB st a = true ↔ AllowedAction st a := by
  simp only [allowedActionB, AllowedAction, List.any_eq_true, Bool.and_eq_true, beq_iff_eq]
  constructor
  · rintro ⟨s, hs, he, ap, hap, hm⟩
    exact ⟨s, hs, he, ap, hap, (globMatch_iff ap a).mp hm⟩
  · rintro ⟨s, hs, he, ap, hap, hm⟩
    exact ⟨s, hs, he, ap, hap, (globMatch_iff ap a).mpr hm⟩

/-! ## Role identifiers (`iam:PassRole` Resources) -/

/-- The pattern of a role ARN, `arn:<nstar>:iam:<nstar>:<nstar>:role/` followed by a name pattern. -/
def roleArnPat (np : List Tok) : List Tok :=
  lits "arn:".toList ++ ([.nstar] ++ (lits ":iam:".toList ++ ([.nstar] ++ (lits ":".toList ++
    ([.nstar] ++ (lits ":role/".toList ++ np))))))

theorem roleArnPat_iff (np : List Tok) (x : List Char) :
    Matches (roleArnPat np) x ↔ ∃ part reg acct n, NoColon part ∧ NoColon reg ∧ NoColon acct ∧ Matches np n ∧
      x = "arn:".toList ++ part ++ ":iam:".toList ++ reg ++ ":".toList ++ acct ++ ":role/".toList ++ n := by
  constructor
  · intro h0
    simp only [roleArnPat] at h0
    -- Fresh names: `rfl` reverts and reintroduces the hypotheses that mention the substituted variable.
    obtain ⟨s1, rfl, h1⟩ := (matches_lits_append _ _ _).mp h0
    obtain ⟨part, s2, rfl, hp, h2⟩ := (matches_nstar_append _ _).mp h1
    obtain ⟨s3, rfl, h3⟩ := (matches_lits_append _ _ _).mp h2
    obtain ⟨reg, s4, rfl, hr, h4⟩ := (matches_nstar_append _ _).mp h3
    obtain ⟨s5, rfl, h5⟩ := (matches_lits_append _ _ _).mp h4
    obtain ⟨acct, s6, rfl, ha, h6⟩ := (matches_nstar_append _ _).mp h5
    obtain ⟨n, rfl, h7⟩ := (matches_lits_append _ _ _).mp h6
    exact ⟨part, reg, acct, n, hp, hr, ha, h7, by simp [List.append_assoc]⟩
  · rintro ⟨part, reg, acct, n, hp, hr, ha, hn, rfl⟩
    simp only [roleArnPat, List.append_assoc]
    exact (matches_lits_append _ _ _).mpr ⟨_, rfl, (matches_nstar_append _ _).mpr ⟨part, _, rfl, hp,
      (matches_lits_append _ _ _).mpr ⟨_, rfl, (matches_nstar_append _ _).mpr ⟨reg, _, rfl, hr,
      (matches_lits_append _ _ _).mpr ⟨_, rfl, (matches_nstar_append _ _).mpr ⟨acct, _, rfl, ha,
      (matches_lits_append _ _ _).mpr ⟨_, rfl, hn⟩⟩⟩⟩⟩⟩⟩

/-- The unknown name of an unnamed role: some U+0000, and no colon. -/
def freshPat : List Tok := [.nstar] ++ (lits ['\u0000'] ++ [.nstar])

theorem freshPat_iff (n : List Char) : Matches freshPat n ↔ '\u0000' ∈ n ∧ ':' ∉ n := by
  constructor
  · intro h0
    obtain ⟨a, s2, rfl, ha, h1⟩ := (matches_nstar_append _ _).mp h0
    obtain ⟨b, rfl, h2⟩ := (matches_lits_append _ _ _).mp h1
    have hb := (matches_nstar_iff b).mp h2
    refine ⟨by simp, ?_⟩
    simp only [List.mem_append, List.mem_cons, not_or]
    exact ⟨ha, by decide, hb⟩
  · rintro ⟨h0, hc⟩
    obtain ⟨a, b, rfl⟩ := List.append_of_mem h0
    simp only [List.mem_append, List.mem_cons, not_or] at hc
    exact (matches_nstar_append _ _).mpr ⟨a, _, rfl, hc.1,
      (matches_lits_append _ _ _).mpr ⟨b, rfl, (matches_nstar_iff b).mpr hc.2.2⟩⟩

/-- The name patterns of a role. -/
def namePats (t : Role) : List (List Tok) :=
  match t.name with
  | some nm => [lits nm.toList]
  | none => [lits (opaqueName t), freshPat]

theorem namePats_iff (t : Role) (n : List Char) :
    (∃ q ∈ namePats t, Matches q n) ↔ PossibleName t n := by
  unfold namePats PossibleName
  cases t.name with
  | some nm => simp [matches_lits_iff]
  | none => simp [matches_lits_iff, freshPat_iff]

/-- The patterns of everything an `iam:PassRole` Resource may denote for the role (`RoleIdent`). -/
def identPats (t : Role) : List (List Tok) :=
  (namePats t).map roleArnPat ++ (match t.name with | some nm => [lits nm.toList] | none => []) ++
    [lits t.idLower.toList]

theorem identPats_iff (t : Role) (x : List Char) :
    (∃ q ∈ identPats t, Matches q x) ↔ RoleIdent t x := by
  unfold identPats RoleIdent
  constructor
  · rintro ⟨q, hq, hm⟩
    simp only [List.mem_append, List.mem_map, List.mem_singleton] at hq
    rcases hq with (⟨np, hnp, rfl⟩ | hq) | rfl
    · obtain ⟨part, reg, acct, n, hp, hr, ha, hn, rfl⟩ := (roleArnPat_iff np _).mp hm
      exact Or.inl ⟨part, reg, acct, n, hp, hr, ha, (namePats_iff t n).mp ⟨np, hnp, hn⟩, rfl⟩
    · revert hq; cases hname : t.name with
      | none => intro hq; simp at hq
      | some nm =>
        intro hq; simp only [List.mem_singleton] at hq; subst hq
        exact Or.inr (Or.inl ⟨nm, rfl, (matches_lits_iff _ _).mp hm⟩)
    · exact Or.inr (Or.inr ((matches_lits_iff _ _).mp hm))
  · rintro (⟨part, reg, acct, n, hp, hr, ha, hn, rfl⟩ | ⟨nm, hnm, rfl⟩ | rfl)
    · obtain ⟨np, hnp, hm⟩ := (namePats_iff t n).mpr hn
      exact ⟨roleArnPat np, by simp only [List.mem_append, List.mem_map]; exact Or.inl (Or.inl ⟨np, hnp, rfl⟩),
        (roleArnPat_iff np _).mpr ⟨part, reg, acct, n, hp, hr, ha, hm, rfl⟩⟩
    · exact ⟨lits nm.toList, by simp [hnm], (matches_lits_iff _ _).mpr rfl⟩
    · exact ⟨lits t.idLower.toList, by simp, (matches_lits_iff _ _).mpr rfl⟩

/-- P may pass T: some Allow statement of P allows `iam:passrole` on a Resource that meets an identifier pattern of T. -/
def passB (p t : Role) : Bool := (identPats t).any fun q => allowedB p.stmts "iam:passrole".toList q

theorem passB_iff (p t : Role) :
    passB p t = true ↔ ∃ x, RoleIdent t x ∧ Allowed p.stmts "iam:passrole".toList x := by
  simp only [passB, List.any_eq_true, allowedB_iff]
  constructor
  · rintro ⟨q, hq, x, hm, ha⟩
    exact ⟨x, (identPats_iff t x).mp ⟨q, hq, hm⟩, ha⟩
  · rintro ⟨x, hr, ha⟩
    obtain ⟨q, hq, hm⟩ := (identPats_iff t x).mpr hr
    exact ⟨q, hq, x, hm, ha⟩

/-! ## Reaching the protected bucket -/

/-- The objects of a bucket: the bucket ARN, `/`, then any key. -/
def objPat (b : String) : List Tok := lits (b.toList ++ ['/']) ++ [.star]

theorem objPat_iff (b : String) (x : List Char) : Matches (objPat b) x ↔ ∃ key, x = b.toList ++ '/' :: key := by
  rw [objPat, matches_lits_append]
  constructor
  · rintro ⟨key, rfl, _⟩; exact ⟨key, by simp⟩
  · rintro ⟨key, rfl⟩; exact ⟨key, by simp, matches_star key⟩

def reachesB (t : Role) (b : String) : Bool :=
  Tables.objectActions.any (fun a => allowedB t.stmts a.toList (objPat b)) ||
    Tables.bucketGrantActions.any (fun a => allowedB t.stmts a.toList (lits b.toList))

theorem reachesB_iff (t : Role) (b : String) : reachesB t b = true ↔ Reaches t b := by
  simp only [reachesB, Reaches, Bool.or_eq_true, List.any_eq_true, allowedB_iff]
  apply or_congr
  · constructor
    · rintro ⟨a, ha, x, hm, hx⟩
      obtain ⟨key, rfl⟩ := (objPat_iff b x).mp hm
      exact ⟨a, ha, key, hx⟩
    · rintro ⟨a, ha, key, hx⟩
      exact ⟨a, ha, _, (objPat_iff b _).mpr ⟨key, rfl⟩, hx⟩
  · constructor
    · rintro ⟨a, ha, x, hm, hx⟩
      rw [matches_lits_iff] at hm; subst hm; exact ⟨a, ha, hx⟩
    · rintro ⟨a, ha, hx⟩
      exact ⟨a, ha, _, (matches_lits_iff _ _).mpr rfl, hx⟩

/-! ## The launch table indexed by service prefix

Under kernel evaluation a scan of the 879 entries took 754 s (design 6). An action pattern whose service prefix (before
`:`) is literal can only match entries of that group, because no group name and no prefix contains a colon. -/

/-- The literal service prefix of a pattern, and the rest after `:`, when the prefix has no wildcard. -/
def splitPrefix : List Tok → Option (List Char × List Tok)
  | [] => none
  | .lit ':' :: rest => some ([], rest)
  | .lit c :: rest => (splitPrefix rest).map fun (pre, r) => (c :: pre, r)
  | _ => none

theorem splitPrefix_spec : ∀ (ap : List Tok) (pre : List Char) (rest : List Tok),
    splitPrefix ap = some (pre, rest) → ap = lits pre ++ .lit ':' :: rest ∧ ':' ∉ pre
  | [], _, _, h => by simp [splitPrefix] at h
  | .lit c :: r, pre, rest, h => by
    by_cases hc : c = ':'
    · subst hc
      simp only [splitPrefix, Option.some.injEq, Prod.mk.injEq] at h
      obtain ⟨rfl, rfl⟩ := h
      simp [lits]
    · have h' : (splitPrefix r).map (fun (x : List Char × List Tok) => (c :: x.1, x.2)) = some (pre, rest) := by
        simpa [splitPrefix, hc] using h
      obtain ⟨⟨pre', rest'⟩, hs, he⟩ := Option.map_eq_some_iff.mp h'
      simp only [Prod.mk.injEq] at he
      obtain ⟨rfl, rfl⟩ := he
      obtain ⟨h1, h2⟩ := splitPrefix_spec r pre' rest' hs
      subst h1
      refine ⟨by simp [lits], ?_⟩
      simp only [List.mem_cons, not_or]
      exact ⟨fun e => hc e.symm, h2⟩
  | .one :: _, _, _, h => by simp [splitPrefix] at h
  | .star :: _, _, _, h => by simp [splitPrefix] at h
  | .nstar :: _, _, _, h => by simp [splitPrefix] at h

/-- Two strings split at their first colon are equal only if both parts are. -/
theorem sep_unique : ∀ (g pre n s : List Char), ':' ∉ g → ':' ∉ pre →
    (g ++ ':' :: n = pre ++ ':' :: s ↔ g = pre ∧ n = s)
  | [], [], n, s, _, _ => by simp
  | [], c :: pre, n, s, _, hp => by
    simp only [List.nil_append, List.cons_append, List.cons.injEq]
    constructor
    · rintro ⟨rfl, _⟩; simp at hp
    · rintro ⟨h, _⟩; cases h
  | c :: g, [], n, s, hg, _ => by
    simp only [List.nil_append, List.cons_append, List.cons.injEq]
    constructor
    · rintro ⟨rfl, _⟩; simp at hg
    · rintro ⟨h, _⟩; cases h
  | c :: g, d :: pre, n, s, hg, hp => by
    simp only [List.cons_append, List.cons.injEq, List.mem_cons, not_or] at hg hp ⊢
    rw [sep_unique g pre n s hg.2 hp.2]
    constructor
    · rintro ⟨rfl, rfl, rfl⟩; exact ⟨⟨rfl, rfl⟩, rfl⟩
    · rintro ⟨⟨rfl, rfl⟩, rfl⟩; exact ⟨rfl, rfl, rfl⟩

/-- No group name of the launch table contains a colon (checked by the kernel). -/
theorem groupsNoColon : Tables.launchGroups.all (fun g => !(g.1.toList.contains ':')) = true := by decide

theorem groupNoColon {g : String × List (String × List String)} (hg : g ∈ Tables.launchGroups) :
    ':' ∉ g.1.toList := by
  have h := List.all_eq_true.mp groupsNoColon g hg
  simpa [List.contains_iff_mem] using h

theorem mem_launchTable (e : String × List String) :
    e ∈ launchTable ↔ ∃ g ∈ Tables.launchGroups, ∃ en ∈ g.2, e = (g.1 ++ ":" ++ en.1, en.2) := by
  simp only [launchTable, List.mem_flatMap, List.mem_map]
  constructor
  · rintro ⟨g, hg, en, hen, rfl⟩; exact ⟨g, hg, en, hen, rfl⟩
  · rintro ⟨g, hg, en, hen, rfl⟩; exact ⟨g, hg, en, hen, rfl⟩

/-- The entries that an action pattern matches, looked up by service prefix when it is literal. -/
def entriesForIdx (ap : List Tok) : List (String × List String) :=
  match splitPrefix ap with
  | some (pre, rest) =>
    (Tables.launchGroups.filter fun g => g.1.toList == pre).flatMap fun g =>
      (g.2.filter fun en => globMatch rest en.1.toList).map fun en => (g.1 ++ ":" ++ en.1, en.2)
  | none => launchTable.filter fun e => globMatch ap e.1.toList

theorem mem_entriesForIdx (ap : List Tok) (e : String × List String) :
    e ∈ entriesForIdx ap ↔ e ∈ launchTable ∧ globMatch ap e.1.toList = true := by
  unfold entriesForIdx
  split
  · rename_i pre rest hsplit
    obtain ⟨hap, hpre⟩ := splitPrefix_spec ap pre rest hsplit
    rw [mem_launchTable]
    simp only [List.mem_flatMap, List.mem_filter, List.mem_map, beq_iff_eq]
    constructor
    · rintro ⟨g, ⟨hg, hgp⟩, en, ⟨hen, hm⟩, rfl⟩
      refine ⟨⟨g, hg, en, hen, rfl⟩, ?_⟩
      rw [globMatch_iff, hap, matches_lits_append]
      refine ⟨':' :: en.1.toList, ?_, .lit ((globMatch_iff _ _).mp hm)⟩
      simp [String.toList_append, hgp]
    · rintro ⟨⟨g, hg, en, hen, rfl⟩, hm⟩
      rw [globMatch_iff, hap, matches_lits_append] at hm
      obtain ⟨s2, hs, hm2⟩ := hm
      cases hm2 with
      | @lit _ _ s3 hm3 =>
        have heq : g.1.toList ++ ':' :: en.1.toList = pre ++ ':' :: s3 := by
          simpa [String.toList_append] using hs
        obtain ⟨hgp, hn⟩ := (sep_unique _ _ _ _ (groupNoColon hg) hpre).mp heq
        exact ⟨g, ⟨hg, hgp⟩, en, ⟨hen, (globMatch_iff _ _).mpr (hn ▸ hm3)⟩, rfl⟩
  · simp only [List.mem_filter]

/-- The action `*` matches every entry, so the table is returned without matching any name. A pattern with any
other wildcard in the service prefix falls back to a scan of the whole table, which is slow under the kernel (more
than 12 minutes was measured for one such pattern on 2026-11-29). -/
def entriesFor (ap : List Tok) : List (String × List String) :=
  if ap = [.star] then launchTable else entriesForIdx ap

theorem mem_entriesFor (ap : List Tok) (e : String × List String) :
    e ∈ entriesFor ap ↔ e ∈ launchTable ∧ globMatch ap e.1.toList = true := by
  unfold entriesFor
  by_cases h : ap = [.star]
  · subst h
    simp only [if_true]
    exact ⟨fun he => ⟨he, (globMatch_iff _ _).mpr (matches_star _)⟩, fun h => h.1⟩
  · rw [if_neg h]
    exact mem_entriesForIdx ap e

/-- The launch-table entries that P may call, through the index. -/
def launchEntries (p : Role) : List (String × List String) :=
  p.stmts.flatMap fun s => if s.effect == .allow then s.actions.flatMap entriesFor else []

theorem mem_launchEntries (p : Role) (e : String × List String) :
    e ∈ launchEntries p ↔ e ∈ launchTable ∧ AllowedAction p.stmts e.1.toList := by
  simp only [launchEntries, AllowedAction, List.mem_flatMap]
  constructor
  · rintro ⟨s, hs, hm⟩
    by_cases he : s.effect = .allow
    · simp only [he, beq_self_eq_true, if_true, List.mem_flatMap] at hm
      obtain ⟨ap, hap, hm⟩ := hm
      obtain ⟨ht, hg⟩ := (mem_entriesFor ap e).mp hm
      exact ⟨ht, s, hs, he, ap, hap, (globMatch_iff _ _).mp hg⟩
    · have : (s.effect == Effect.allow) = false := by simpa using he
      simp [this] at hm
  · rintro ⟨ht, s, hs, he, ap, hap, hm⟩
    refine ⟨s, hs, ?_⟩
    simp only [he, beq_self_eq_true, if_true, List.mem_flatMap]
    exact ⟨ap, hap, (mem_entriesFor ap e).mpr ⟨ht, (globMatch_iff _ _).mpr hm⟩⟩

/-! ## Launching a service that the target trusts -/

/-- Some service is both a service of the table entry (or the entry is for any service) and trusted by the target. -/
def svcOk (E T : List String) : Bool :=
  (E.contains "*" && !T.isEmpty) || E.any (fun s => T.contains s) || (!E.isEmpty && T.contains "*")

theorem svcOk_iff (E T : List String) :
    svcOk E T = true ↔ ∃ svc, (svc ∈ E ∨ "*" ∈ E) ∧ (svc ∈ T ∨ "*" ∈ T) := by
  simp only [svcOk, Bool.or_eq_true, Bool.and_eq_true, List.contains_iff_mem, Bool.not_eq_true',
    List.isEmpty_eq_false_iff, List.any_eq_true]
  constructor
  · rintro ((⟨hE, hT⟩ | ⟨s, hs, hsT⟩) | ⟨hE, hT⟩)
    · obtain ⟨t0, rest, rfl⟩ := List.exists_cons_of_ne_nil hT
      exact ⟨t0, Or.inr hE, Or.inl (by simp)⟩
    · exact ⟨s, Or.inl hs, Or.inl hsT⟩
    · obtain ⟨e0, rest, rfl⟩ := List.exists_cons_of_ne_nil hE
      exact ⟨e0, Or.inl (by simp), Or.inr hT⟩
  · rintro ⟨svc, h1 | h1, h2 | h2⟩
    · exact Or.inl (Or.inr ⟨svc, h1, h2⟩)
    · exact Or.inr ⟨List.ne_nil_of_mem h1, h2⟩
    · exact Or.inl (Or.inl ⟨h1, List.ne_nil_of_mem h2⟩)
    · exact Or.inl (Or.inl ⟨h1, List.ne_nil_of_mem h2⟩)

def launchB (p t : Role) : Bool := (launchEntries p).any fun e => svcOk e.2 t.trusts

theorem launchB_iff (p t : Role) : launchB p t = true ↔ ∃ svc, CanLaunch p svc ∧ Trusts t svc := by
  simp only [launchB, List.any_eq_true, mem_launchEntries, svcOk_iff, CanLaunch, Trusts]
  constructor
  · rintro ⟨e, ⟨he, ha⟩, svc, h1, h2⟩
    exact ⟨svc, ⟨e, he, h1, ha⟩, h2⟩
  · rintro ⟨svc, ⟨e, he, h1, ha⟩, h2⟩
    exact ⟨e, ⟨he, ha⟩, svc, h1, h2⟩

/-! ## The finding list and the main theorem -/

def pathB (m : Model) (p t : Role) (b : String) : Bool :=
  t.id != p.id && !(m.exempt.contains t.id) && passB p t && launchB p t && reachesB t b

theorem pathB_iff (m : Model) (p t : Role) (b : String) (ht : t ∈ m.roles) :
    pathB m p t b = true ↔ EscalatesTo m p t b := by
  simp only [pathB, EscalatesTo, Bool.and_eq_true, bne_iff_ne, Bool.not_eq_true', passB_iff, launchB_iff,
    reachesB_iff]
  have hc : m.exempt.contains t.id = false ↔ t.id ∉ m.exempt := by
    rw [← Bool.not_eq_true, List.contains_iff_mem]
  constructor
  · rintro ⟨⟨⟨⟨hne, hex⟩, hp⟩, hl⟩, hr⟩
    exact ⟨ht, hne, hc.mp hex, hp, hl, hr⟩
  · rintro ⟨_, hne, hex, hp, hl, hr⟩
    exact ⟨⟨⟨⟨hne, hc.mpr hex⟩, hp⟩, hl⟩, hr⟩

/-- The `PG-IAM-004` PassRole findings: (principal, target, bucket), computed with matching and intersection. -/
def findings (m : Model) : List (String × String × String) :=
  m.roles.flatMap fun p => m.roles.flatMap fun t => m.buckets.filterMap fun b =>
    if pathB m p t b then some (p.id, t.id, b) else none

/-- **Main theorem.** A triple is a finding exactly when the rule over request strings holds for roles and a bucket of
the model with these identifiers. -/
theorem findings_iff (m : Model) (x : String × String × String) :
    x ∈ findings m ↔ ∃ P ∈ m.roles, ∃ T ∈ m.roles, ∃ b ∈ m.buckets, x = (P.id, T.id, b) ∧ EscalatesTo m P T b := by
  simp only [findings, List.mem_flatMap, List.mem_filterMap, Option.ite_none_right_eq_some, Option.some.injEq]
  constructor
  · rintro ⟨P, hP, T, hT, b, hb, hpath, rfl⟩
    exact ⟨P, hP, T, hT, b, hb, rfl, (pathB_iff m P T b hT).mp hpath⟩
  · rintro ⟨P, hP, T, hT, b, hb, rfl, he⟩
    exact ⟨P, hP, T, hT, b, hb, (pathB_iff m P T b hT).mpr he, rfl⟩

/-- The empty finding list means: no principal of the model escalates to any protected bucket. -/
theorem safe_iff (m : Model) :
    findings m = [] ↔ ∀ P ∈ m.roles, ∀ T, ∀ b ∈ m.buckets, ¬ EscalatesTo m P T b := by
  constructor
  · intro h P hP T b hb he
    have hT : T ∈ m.roles := he.1
    have := (findings_iff m (P.id, T.id, b)).mpr ⟨P, hP, T, hT, b, hb, rfl, he⟩
    rw [h] at this; simp at this
  · intro h
    apply List.eq_nil_iff_forall_not_mem.mpr
    intro x hx
    obtain ⟨P, hP, T, _, b, hb, _, he⟩ := (findings_iff m x).mp hx
    exact h P hP T b hb he

/-! ## Unique logical IDs: the roles of a finding are the roles of the model -/

theorem eq_of_mem_of_nodup_map {α β : Type} {f : α → β} :
    ∀ {l : List α} {a b : α}, (l.map f).Nodup → a ∈ l → b ∈ l → f a = f b → a = b
  | [], _, _, _, ha, _, _ => by simp at ha
  | x :: l, a, b, hn, ha, hb, he => by
    rw [List.map_cons, List.nodup_cons] at hn
    obtain ⟨hx, hn⟩ := hn
    rcases List.mem_cons.mp ha with rfl | ha' <;> rcases List.mem_cons.mp hb with rfl | hb'
    · rfl
    · exact absurd (he ▸ List.mem_map_of_mem hb') hx
    · exact absurd (he.symm ▸ List.mem_map_of_mem ha') hx
    · exact eq_of_mem_of_nodup_map hn ha' hb' he

/-- Under `WellFormed`, the finding with the identifiers of P and T holds exactly when P escalates through T. -/
theorem findings_iff_wf {m : Model} (hw : WellFormed m) {P T : Role} (hP : P ∈ m.roles) (hT : T ∈ m.roles)
    (b : String) : (P.id, T.id, b) ∈ findings m ↔ b ∈ m.buckets ∧ EscalatesTo m P T b := by
  rw [findings_iff]
  constructor
  · rintro ⟨P', hP', T', hT', b', hb', he, hesc⟩
    simp only [Prod.mk.injEq] at he
    obtain ⟨h1, h2, rfl⟩ := he
    have := eq_of_mem_of_nodup_map hw hP hP' h1
    have := eq_of_mem_of_nodup_map hw hT hT' h2
    subst P'; subst T'
    exact ⟨hb', hesc⟩
  · rintro ⟨hb, hesc⟩
    exact ⟨P, hP, T, hT, b, hb, rfl, hesc⟩

/-! ## Exemption -/

/-- Adding a logical ID to `allowedPassRoleTargets` removes exactly the findings whose target has that ID. -/
theorem findings_exempt (m : Model) (x : String) (y : String × String × String) :
    y ∈ findings { m with exempt := x :: m.exempt } ↔ y ∈ findings m ∧ y.2.1 ≠ x := by
  rw [findings_iff, findings_iff]
  simp only [EscalatesTo, List.mem_cons, not_or]
  constructor
  · rintro ⟨P, hP, T, hT, b, hb, rfl, hT', hne, ⟨hx, hex⟩, rest⟩
    exact ⟨⟨P, hP, T, hT, b, hb, rfl, hT', hne, hex, rest⟩, hx⟩
  · rintro ⟨⟨P, hP, T, hT, b, hb, rfl, hT', hne, hex, rest⟩, hx⟩
    exact ⟨P, hP, T, hT, b, hb, rfl, hT', hne, ⟨hx, hex⟩, rest⟩

/-! ## Monotonicity: more statements or more roles never remove a finding -/

/-- `r'` is `r` with possibly more statements. -/
structure RoleLe (r r' : Role) : Prop where
  id : r'.id = r.id
  idLower : r'.idLower = r.idLower
  name : r'.name = r.name
  trusts : r'.trusts = r.trusts
  stmts : ∀ s ∈ r.stmts, s ∈ r'.stmts

/-- `m'` has the buckets and exemptions of `m`, and every role of `m` with possibly more statements. -/
def ModelLe (m m' : Model) : Prop :=
  m'.buckets = m.buckets ∧ m'.exempt = m.exempt ∧ ∀ r ∈ m.roles, ∃ r' ∈ m'.roles, RoleLe r r'

theorem allowed_mono {st st' : List Stmt} (h : ∀ s ∈ st, s ∈ st') {a x : List Char} :
    Allowed st a x → Allowed st' a x := by
  rintro ⟨s, hs, rest⟩; exact ⟨s, h s hs, rest⟩

theorem allowedAction_mono {st st' : List Stmt} (h : ∀ s ∈ st, s ∈ st') {a : List Char} :
    AllowedAction st a → AllowedAction st' a := by
  rintro ⟨s, hs, rest⟩; exact ⟨s, h s hs, rest⟩

theorem roleIdent_congr {t t' : Role} (h : RoleLe t t') (x : List Char) : RoleIdent t' x ↔ RoleIdent t x := by
  unfold RoleIdent PossibleName opaqueName
  rw [h.name, h.idLower]

theorem escalates_mono {m m' : Model} (hm : ModelLe m m') {P T P' T' : Role} (hP : RoleLe P P')
    (hT : RoleLe T T') (hT' : T' ∈ m'.roles) (b : String) : EscalatesTo m P T b → EscalatesTo m' P' T' b := by
  obtain ⟨_, hex, _⟩ := hm
  rintro ⟨_, hne, hx, ⟨x, hr, ha⟩, ⟨svc, ⟨e, he, hsvc, hla⟩, htr⟩, hreach⟩
  refine ⟨hT', by rw [hP.id, hT.id]; exact hne, by rw [hex, hT.id]; exact hx,
    ⟨x, (roleIdent_congr hT x).mpr hr, allowed_mono hP.stmts ha⟩,
    ⟨svc, ⟨e, he, hsvc, allowedAction_mono hP.stmts hla⟩, by unfold Trusts; rw [hT.trusts]; exact htr⟩, ?_⟩
  rcases hreach with ⟨a, ha, key, hk⟩ | ⟨a, ha, hk⟩
  · exact Or.inl ⟨a, ha, key, allowed_mono hT.stmts hk⟩
  · exact Or.inr ⟨a, ha, allowed_mono hT.stmts hk⟩

/-- Adding statements to roles, or adding roles, never removes a finding. -/
theorem findings_mono {m m' : Model} (hm : ModelLe m m') (y : String × String × String) :
    y ∈ findings m → y ∈ findings m' := by
  rw [findings_iff, findings_iff]
  rintro ⟨P, hP, T, hT, b, hb, rfl, hesc⟩
  obtain ⟨P', hP', hPle⟩ := hm.2.2 P hP
  obtain ⟨T', hT', hTle⟩ := hm.2.2 T hT
  have hb' := hm.1
  exact ⟨P', hP', T', hT', b, by rw [hb']; exact hb, by rw [hPle.id, hTle.id],
    escalates_mono hm hPle hTle hT' b hesc⟩

end ProofGate.Eval

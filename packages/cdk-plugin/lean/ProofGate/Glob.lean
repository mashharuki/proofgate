/-!
# ProofGate.Glob

IAMのAction・Resourceのパターン（`*`は任意の文字列、`?`は任意の1文字）と、ARNのパーティション・リージョン・アカウントを表す
「コロンを含まない任意の文字列」（`nstar`）の意味を、宣言的な関係`Matches`で定義します。実行用の照合`globMatch`と、2つの
パターンに共通の文字列があるかの判定`intersect`は、どちらも`Matches`と過不足なく一致することを、すべての入力について
証明します（`globMatch_iff`、`intersect_iff`）。カーネルで評価できるよう、再帰はすべて構造的です（`intersect`は燃料つき）。

The meaning of IAM Action and Resource patterns (`*` any run, `?` one character) and of `nstar` (a run without a colon, for
the partition, region, and account of an ARN) is the declarative relation `Matches`. The executable matcher `globMatch` and
the intersection test `intersect` are proved to decide `Matches` exactly, for every input (`globMatch_iff`,
`intersect_iff`). All recursion is structural (`intersect` uses fuel), so the kernel can evaluate them.

Spec `proofgate-lean-evaluator`, design sections 2 and 5.1. Moved from `spike/IntersectNSpike.lean` (2026-11-27), which a
Kiro sub-agent wrote; the proofs are unchanged.
-/
namespace ProofGate.Glob

inductive Tok where
  | lit (c : Char)
  | one
  | star
  | nstar
  deriving Repr, DecidableEq

inductive Matches : List Tok → List Char → Prop where
  | nil : Matches [] []
  | lit {c p s} : Matches p s → Matches (.lit c :: p) (c :: s)
  | one {c p s} : Matches p s → Matches (.one :: p) (c :: s)
  | starSkip {p s} : Matches p s → Matches (.star :: p) s
  | starEat {c p s} : Matches (.star :: p) s → Matches (.star :: p) (c :: s)
  | nstarSkip {p s} : Matches p s → Matches (.nstar :: p) s
  | nstarEat {c p s} : c ≠ ':' → Matches (.nstar :: p) s → Matches (.nstar :: p) (c :: s)

/-- `star` and `nstar` are the tokens that match runs. -/
def starLike : Tok → Bool
  | .star => true
  | .nstar => true
  | _ => false

/-- Which characters a run token may eat. -/
def okc : Tok → Char → Prop
  | .nstar, c => c ≠ ':'
  | _, _ => True

theorem sl_prefix {t : Tok} {p : List Tok} (ht : starLike t = true) (pre suf : List Char)
    (hpre : ∀ c ∈ pre, okc t c) (h : Matches p suf) : Matches (t :: p) (pre ++ suf) := by
  induction pre with
  | nil =>
    cases t with
    | lit _ => simp [starLike] at ht
    | one => simp [starLike] at ht
    | star => exact .starSkip h
    | nstar => exact .nstarSkip h
  | cons c pre ih =>
    have hr := ih (fun x hx => hpre x (by simp [hx]))
    have hc := hpre c (by simp)
    cases t with
    | lit _ => simp [starLike] at ht
    | one => simp [starLike] at ht
    | star => exact .starEat hr
    | nstar => exact .nstarEat hc hr

theorem sl_inv {t : Tok} {p : List Tok} {s : List Char} (ht : starLike t = true)
    (h : Matches (t :: p) s) :
    ∃ pre suf, s = pre ++ suf ∧ (∀ c ∈ pre, okc t c) ∧ Matches p suf := by
  generalize hq : (t :: p) = q at h
  induction h with
  | nil => cases hq
  | lit _ _ => cases hq; simp [starLike] at ht
  | one _ _ => cases hq; simp [starLike] at ht
  | starSkip h _ => cases hq; exact ⟨[], _, rfl, by simp, h⟩
  | @starEat c _ s _ ih =>
    obtain ⟨pre, suf, rfl, hpre, h⟩ := ih hq
    refine ⟨c :: pre, suf, rfl, ?_, h⟩
    intro x hx
    simp only [List.mem_cons] at hx
    rcases hx with rfl | hx
    · cases hq; simp [okc]
    · exact hpre x hx
  | nstarSkip h _ => cases hq; exact ⟨[], _, rfl, by simp, h⟩
  | @nstarEat c _ s hc _ ih =>
    obtain ⟨pre, suf, rfl, hpre, h⟩ := ih hq
    refine ⟨c :: pre, suf, rfl, ?_, h⟩
    intro x hx
    simp only [List.mem_cons] at hx
    rcases hx with rfl | hx
    · cases hq; exact hc
    · exact hpre x hx

/-- Two run tokens facing each other: one of them can be skipped. -/
theorem sl_sl {t u : Tok} {p q : List Tok} {s : List Char}
    (ht : starLike t = true) (hu : starLike u = true)
    (hp : Matches (t :: p) s) (hq : Matches (u :: q) s) :
    (∃ s', Matches p s' ∧ Matches (u :: q) s') ∨ (∃ s', Matches (t :: p) s' ∧ Matches q s') := by
  obtain ⟨a, s1, rfl, ha, hp'⟩ := sl_inv ht hp
  obtain ⟨b, s2, hs, hb, hq'⟩ := sl_inv hu hq
  rcases List.append_eq_append_iff.mp hs with ⟨m, rfl, rfl⟩ | ⟨m, rfl, rfl⟩
  · exact Or.inl ⟨_, hp',
      sl_prefix hu m s2 (fun c hc => hb c (List.mem_append.mpr (Or.inr hc))) hq'⟩
  · exact Or.inr ⟨_,
      sl_prefix ht m s1 (fun c hc => ha c (List.mem_append.mpr (Or.inr hc))) hp', hq'⟩

/-- Fuel-bounded intersection test. Every recursive call removes one token in total,
so fuel `p.length + q.length + 1` is enough (`interF_complete`). -/
def interF : Nat → List Tok → List Tok → Bool
  | 0, _, _ => false
  | _+1, [], [] => true
  | n+1, [], .star :: q => interF n [] q
  | n+1, [], .nstar :: q => interF n [] q
  | _+1, [], .one :: _ => false
  | _+1, [], .lit _ :: _ => false
  | n+1, .star :: p, [] => interF n p []
  | n+1, .nstar :: p, [] => interF n p []
  | _+1, .one :: _, [] => false
  | _+1, .lit _ :: _, [] => false
  | n+1, .star :: p, .star :: q => interF n p (.star :: q) || interF n (.star :: p) q
  | n+1, .star :: p, .nstar :: q => interF n p (.nstar :: q) || interF n (.star :: p) q
  | n+1, .nstar :: p, .star :: q => interF n p (.star :: q) || interF n (.nstar :: p) q
  | n+1, .nstar :: p, .nstar :: q => interF n p (.nstar :: q) || interF n (.nstar :: p) q
  | n+1, .star :: p, .one :: q => interF n p (.one :: q) || interF n (.star :: p) q
  | n+1, .star :: p, .lit d :: q => interF n p (.lit d :: q) || interF n (.star :: p) q
  | n+1, .nstar :: p, .one :: q => interF n p (.one :: q) || interF n (.nstar :: p) q
  | n+1, .nstar :: p, .lit d :: q =>
    interF n p (.lit d :: q) || (d != ':' && interF n (.nstar :: p) q)
  | n+1, .one :: p, .star :: q => interF n (.one :: p) q || interF n p (.star :: q)
  | n+1, .lit c :: p, .star :: q => interF n (.lit c :: p) q || interF n p (.star :: q)
  | n+1, .one :: p, .nstar :: q => interF n (.one :: p) q || interF n p (.nstar :: q)
  | n+1, .lit c :: p, .nstar :: q =>
    interF n (.lit c :: p) q || (c != ':' && interF n p (.nstar :: q))
  | n+1, .one :: p, .one :: q => interF n p q
  | n+1, .one :: p, .lit _ :: q => interF n p q
  | n+1, .lit _ :: p, .one :: q => interF n p q
  | n+1, .lit c :: p, .lit d :: q => c == d && interF n p q

/-- Soundness for any fuel. -/
theorem interF_sound : ∀ (n : Nat) (p q : List Tok),
    interF n p q = true → ∃ s, Matches p s ∧ Matches q s
  | 0, _, _, h => by simp [interF] at h
  | _+1, [], [], _ => ⟨[], .nil, .nil⟩
  | n+1, [], .star :: q, h => by
    simp only [interF] at h
    obtain ⟨s, hp, hq⟩ := interF_sound n [] q h
    cases hp
    exact ⟨[], .nil, .starSkip hq⟩
  | n+1, [], .nstar :: q, h => by
    simp only [interF] at h
    obtain ⟨s, hp, hq⟩ := interF_sound n [] q h
    cases hp
    exact ⟨[], .nil, .nstarSkip hq⟩
  | _+1, [], .one :: _, h => by simp [interF] at h
  | _+1, [], .lit _ :: _, h => by simp [interF] at h
  | n+1, .star :: p, [], h => by
    simp only [interF] at h
    obtain ⟨s, hp, hq⟩ := interF_sound n p [] h
    cases hq
    exact ⟨[], .starSkip hp, .nil⟩
  | n+1, .nstar :: p, [], h => by
    simp only [interF] at h
    obtain ⟨s, hp, hq⟩ := interF_sound n p [] h
    cases hq
    exact ⟨[], .nstarSkip hp, .nil⟩
  | _+1, .one :: _, [], h => by simp [interF] at h
  | _+1, .lit _ :: _, [], h => by simp [interF] at h
  | n+1, .star :: p, .star :: q, h => by
    simp only [interF, Bool.or_eq_true] at h
    rcases h with h | h
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.star :: q) h
      exact ⟨s, .starSkip hp, hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.star :: p) q h
      exact ⟨s, hp, .starSkip hq⟩
  | n+1, .star :: p, .nstar :: q, h => by
    simp only [interF, Bool.or_eq_true] at h
    rcases h with h | h
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.nstar :: q) h
      exact ⟨s, .starSkip hp, hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.star :: p) q h
      exact ⟨s, hp, .nstarSkip hq⟩
  | n+1, .nstar :: p, .star :: q, h => by
    simp only [interF, Bool.or_eq_true] at h
    rcases h with h | h
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.star :: q) h
      exact ⟨s, .nstarSkip hp, hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.nstar :: p) q h
      exact ⟨s, hp, .starSkip hq⟩
  | n+1, .nstar :: p, .nstar :: q, h => by
    simp only [interF, Bool.or_eq_true] at h
    rcases h with h | h
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.nstar :: q) h
      exact ⟨s, .nstarSkip hp, hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.nstar :: p) q h
      exact ⟨s, hp, .nstarSkip hq⟩
  | n+1, .star :: p, .one :: q, h => by
    simp only [interF, Bool.or_eq_true] at h
    rcases h with h | h
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.one :: q) h
      exact ⟨s, .starSkip hp, hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.star :: p) q h
      exact ⟨'a' :: s, .starEat hp, .one hq⟩
  | n+1, .star :: p, .lit d :: q, h => by
    simp only [interF, Bool.or_eq_true] at h
    rcases h with h | h
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.lit d :: q) h
      exact ⟨s, .starSkip hp, hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.star :: p) q h
      exact ⟨d :: s, .starEat hp, .lit hq⟩
  | n+1, .nstar :: p, .one :: q, h => by
    simp only [interF, Bool.or_eq_true] at h
    rcases h with h | h
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.one :: q) h
      exact ⟨s, .nstarSkip hp, hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.nstar :: p) q h
      exact ⟨'a' :: s, .nstarEat (by decide) hp, .one hq⟩
  | n+1, .nstar :: p, .lit d :: q, h => by
    simp only [interF, Bool.or_eq_true, Bool.and_eq_true, bne_iff_ne, ne_eq] at h
    rcases h with h | ⟨hd, h⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.lit d :: q) h
      exact ⟨s, .nstarSkip hp, hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.nstar :: p) q h
      exact ⟨d :: s, .nstarEat hd hp, .lit hq⟩
  | n+1, .one :: p, .star :: q, h => by
    simp only [interF, Bool.or_eq_true] at h
    rcases h with h | h
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.one :: p) q h
      exact ⟨s, hp, .starSkip hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.star :: q) h
      exact ⟨'a' :: s, .one hp, .starEat hq⟩
  | n+1, .lit c :: p, .star :: q, h => by
    simp only [interF, Bool.or_eq_true] at h
    rcases h with h | h
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.lit c :: p) q h
      exact ⟨s, hp, .starSkip hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.star :: q) h
      exact ⟨c :: s, .lit hp, .starEat hq⟩
  | n+1, .one :: p, .nstar :: q, h => by
    simp only [interF, Bool.or_eq_true] at h
    rcases h with h | h
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.one :: p) q h
      exact ⟨s, hp, .nstarSkip hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.nstar :: q) h
      exact ⟨'a' :: s, .one hp, .nstarEat (by decide) hq⟩
  | n+1, .lit c :: p, .nstar :: q, h => by
    simp only [interF, Bool.or_eq_true, Bool.and_eq_true, bne_iff_ne, ne_eq] at h
    rcases h with h | ⟨hc, h⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.lit c :: p) q h
      exact ⟨s, hp, .nstarSkip hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.nstar :: q) h
      exact ⟨c :: s, .lit hp, .nstarEat hc hq⟩
  | n+1, .one :: p, .one :: q, h => by
    simp only [interF] at h
    obtain ⟨s, hp, hq⟩ := interF_sound n p q h
    exact ⟨'a' :: s, .one hp, .one hq⟩
  | n+1, .one :: p, .lit d :: q, h => by
    simp only [interF] at h
    obtain ⟨s, hp, hq⟩ := interF_sound n p q h
    exact ⟨d :: s, .one hp, .lit hq⟩
  | n+1, .lit c :: p, .one :: q, h => by
    simp only [interF] at h
    obtain ⟨s, hp, hq⟩ := interF_sound n p q h
    exact ⟨c :: s, .lit hp, .one hq⟩
  | n+1, .lit c :: p, .lit d :: q, h => by
    simp only [interF, Bool.and_eq_true, beq_iff_eq] at h
    obtain ⟨rfl, h⟩ := h
    obtain ⟨s, hp, hq⟩ := interF_sound n p q h
    exact ⟨c :: s, .lit hp, .lit hq⟩

/-- Completeness when the fuel exceeds the total number of tokens. -/
theorem interF_complete : ∀ (n : Nat) (p q : List Tok), p.length + q.length < n →
    ∀ s, Matches p s → Matches q s → interF n p q = true
  | 0, _, _, hn, _, _, _ => absurd hn (Nat.not_lt_zero _)
  | _+1, [], [], _, _, _, _ => by simp [interF]
  | n+1, [], .star :: q, hn, _, hp, hq => by
    cases hp
    cases hq with
    | starSkip hq' =>
      simp only [interF]
      exact interF_complete n [] q
        (by simp only [List.length_cons, List.length_nil] at *; omega) [] .nil hq'
  | n+1, [], .nstar :: q, hn, _, hp, hq => by
    cases hp
    cases hq with
    | nstarSkip hq' =>
      simp only [interF]
      exact interF_complete n [] q
        (by simp only [List.length_cons, List.length_nil] at *; omega) [] .nil hq'
  | _+1, [], .one :: _, _, _, hp, hq => by cases hp; cases hq
  | _+1, [], .lit _ :: _, _, _, hp, hq => by cases hp; cases hq
  | n+1, .star :: p, [], hn, _, hp, hq => by
    cases hq
    cases hp with
    | starSkip hp' =>
      simp only [interF]
      exact interF_complete n p []
        (by simp only [List.length_cons, List.length_nil] at *; omega) [] hp' .nil
  | n+1, .nstar :: p, [], hn, _, hp, hq => by
    cases hq
    cases hp with
    | nstarSkip hp' =>
      simp only [interF]
      exact interF_complete n p []
        (by simp only [List.length_cons, List.length_nil] at *; omega) [] hp' .nil
  | _+1, .one :: _, [], _, _, hp, hq => by cases hq; cases hp
  | _+1, .lit _ :: _, [], _, _, hp, hq => by cases hq; cases hp
  | n+1, .star :: p, .star :: q, hn, _, hp, hq => by
    simp only [interF, Bool.or_eq_true]
    rcases sl_sl rfl rfl hp hq with ⟨s', h1, h2⟩ | ⟨s', h1, h2⟩
    · exact Or.inl (interF_complete n p _ (by simp only [List.length_cons] at *; omega) s' h1 h2)
    · exact Or.inr (interF_complete n _ q (by simp only [List.length_cons] at *; omega) s' h1 h2)
  | n+1, .star :: p, .nstar :: q, hn, _, hp, hq => by
    simp only [interF, Bool.or_eq_true]
    rcases sl_sl rfl rfl hp hq with ⟨s', h1, h2⟩ | ⟨s', h1, h2⟩
    · exact Or.inl (interF_complete n p _ (by simp only [List.length_cons] at *; omega) s' h1 h2)
    · exact Or.inr (interF_complete n _ q (by simp only [List.length_cons] at *; omega) s' h1 h2)
  | n+1, .nstar :: p, .star :: q, hn, _, hp, hq => by
    simp only [interF, Bool.or_eq_true]
    rcases sl_sl rfl rfl hp hq with ⟨s', h1, h2⟩ | ⟨s', h1, h2⟩
    · exact Or.inl (interF_complete n p _ (by simp only [List.length_cons] at *; omega) s' h1 h2)
    · exact Or.inr (interF_complete n _ q (by simp only [List.length_cons] at *; omega) s' h1 h2)
  | n+1, .nstar :: p, .nstar :: q, hn, _, hp, hq => by
    simp only [interF, Bool.or_eq_true]
    rcases sl_sl rfl rfl hp hq with ⟨s', h1, h2⟩ | ⟨s', h1, h2⟩
    · exact Or.inl (interF_complete n p _ (by simp only [List.length_cons] at *; omega) s' h1 h2)
    · exact Or.inr (interF_complete n _ q (by simp only [List.length_cons] at *; omega) s' h1 h2)
  | n+1, .star :: p, .one :: q, hn, s, hp, hq => by
    simp only [interF, Bool.or_eq_true]
    cases hp with
    | starSkip hp' =>
      left
      exact interF_complete n p (.one :: q)
        (by simp only [List.length_cons] at *; omega) s hp' hq
    | starEat hp' =>
      cases hq with
      | one hq' =>
        right
        exact interF_complete n (.star :: p) q
          (by simp only [List.length_cons] at *; omega) _ hp' hq'
  | n+1, .star :: p, .lit d :: q, hn, s, hp, hq => by
    simp only [interF, Bool.or_eq_true]
    cases hp with
    | starSkip hp' =>
      left
      exact interF_complete n p (.lit d :: q)
        (by simp only [List.length_cons] at *; omega) s hp' hq
    | starEat hp' =>
      cases hq with
      | lit hq' =>
        right
        exact interF_complete n (.star :: p) q
          (by simp only [List.length_cons] at *; omega) _ hp' hq'
  | n+1, .nstar :: p, .one :: q, hn, s, hp, hq => by
    simp only [interF, Bool.or_eq_true]
    cases hp with
    | nstarSkip hp' =>
      left
      exact interF_complete n p (.one :: q)
        (by simp only [List.length_cons] at *; omega) s hp' hq
    | nstarEat _ hp' =>
      cases hq with
      | one hq' =>
        right
        exact interF_complete n (.nstar :: p) q
          (by simp only [List.length_cons] at *; omega) _ hp' hq'
  | n+1, .nstar :: p, .lit d :: q, hn, s, hp, hq => by
    simp only [interF, Bool.or_eq_true, Bool.and_eq_true, bne_iff_ne, ne_eq]
    cases hp with
    | nstarSkip hp' =>
      left
      exact interF_complete n p (.lit d :: q)
        (by simp only [List.length_cons] at *; omega) s hp' hq
    | nstarEat hc hp' =>
      cases hq with
      | lit hq' =>
        right
        exact ⟨hc, interF_complete n (.nstar :: p) q
          (by simp only [List.length_cons] at *; omega) _ hp' hq'⟩
  | n+1, .one :: p, .star :: q, hn, s, hp, hq => by
    simp only [interF, Bool.or_eq_true]
    cases hq with
    | starSkip hq' =>
      left
      exact interF_complete n (.one :: p) q
        (by simp only [List.length_cons] at *; omega) s hp hq'
    | starEat hq' =>
      cases hp with
      | one hp' =>
        right
        exact interF_complete n p (.star :: q)
          (by simp only [List.length_cons] at *; omega) _ hp' hq'
  | n+1, .lit c :: p, .star :: q, hn, s, hp, hq => by
    simp only [interF, Bool.or_eq_true]
    cases hq with
    | starSkip hq' =>
      left
      exact interF_complete n (.lit c :: p) q
        (by simp only [List.length_cons] at *; omega) s hp hq'
    | starEat hq' =>
      cases hp with
      | lit hp' =>
        right
        exact interF_complete n p (.star :: q)
          (by simp only [List.length_cons] at *; omega) _ hp' hq'
  | n+1, .one :: p, .nstar :: q, hn, s, hp, hq => by
    simp only [interF, Bool.or_eq_true]
    cases hq with
    | nstarSkip hq' =>
      left
      exact interF_complete n (.one :: p) q
        (by simp only [List.length_cons] at *; omega) s hp hq'
    | nstarEat _ hq' =>
      cases hp with
      | one hp' =>
        right
        exact interF_complete n p (.nstar :: q)
          (by simp only [List.length_cons] at *; omega) _ hp' hq'
  | n+1, .lit c :: p, .nstar :: q, hn, s, hp, hq => by
    simp only [interF, Bool.or_eq_true, Bool.and_eq_true, bne_iff_ne, ne_eq]
    cases hq with
    | nstarSkip hq' =>
      left
      exact interF_complete n (.lit c :: p) q
        (by simp only [List.length_cons] at *; omega) s hp hq'
    | nstarEat hc hq' =>
      cases hp with
      | lit hp' =>
        right
        exact ⟨hc, interF_complete n p (.nstar :: q)
          (by simp only [List.length_cons] at *; omega) _ hp' hq'⟩
  | n+1, .one :: p, .one :: q, hn, _, hp, hq => by
    cases hp with
    | one hp' =>
      cases hq with
      | one hq' =>
        simp only [interF]
        exact interF_complete n p q (by simp only [List.length_cons] at *; omega) _ hp' hq'
  | n+1, .one :: p, .lit _ :: q, hn, _, hp, hq => by
    cases hp with
    | one hp' =>
      cases hq with
      | lit hq' =>
        simp only [interF]
        exact interF_complete n p q (by simp only [List.length_cons] at *; omega) _ hp' hq'
  | n+1, .lit _ :: p, .one :: q, hn, _, hp, hq => by
    cases hp with
    | lit hp' =>
      cases hq with
      | one hq' =>
        simp only [interF]
        exact interF_complete n p q (by simp only [List.length_cons] at *; omega) _ hp' hq'
  | n+1, .lit _ :: p, .lit _ :: q, hn, _, hp, hq => by
    cases hp with
    | lit hp' =>
      cases hq with
      | lit hq' =>
        simp only [interF, Bool.and_eq_true, beq_iff_eq, true_and]
        exact interF_complete n p q (by simp only [List.length_cons] at *; omega) _ hp' hq'

def intersect (p q : List Tok) : Bool := interF (p.length + q.length + 1) p q

theorem intersect_iff (p q : List Tok) :
    intersect p q = true ↔ ∃ s, Matches p s ∧ Matches q s := by
  constructor
  · exact interF_sound _ p q
  · rintro ⟨s, hp, hq⟩
    exact interF_complete _ p q (Nat.lt_succ_self _) s hp hq

/-! Executable matcher. -/

/-- Some suffix of `s` (including `s` itself and `[]`) satisfies `f`. -/
def anySuffix (f : List Char → Bool) : List Char → Bool
  | [] => f []
  | c :: s => f (c :: s) || anySuffix f s

/-- Some suffix reached by dropping only non-colon characters satisfies `f`. -/
def nAnySuffix (f : List Char → Bool) : List Char → Bool
  | [] => f []
  | c :: s => f (c :: s) || (c != ':' && nAnySuffix f s)

/-- Structural recursion on the pattern only, so the kernel can evaluate it. -/
def globMatch : List Tok → List Char → Bool
  | [], s => s.isEmpty
  | .star :: p, s => anySuffix (globMatch p) s
  | .nstar :: p, s => nAnySuffix (globMatch p) s
  | .one :: _, [] => false
  | .one :: p, _ :: s => globMatch p s
  | .lit _ :: _, [] => false
  | .lit c :: p, d :: s => c == d && globMatch p s

theorem anySuffix_iff (f : List Char → Bool) (s : List Char) :
    anySuffix f s = true ↔ ∃ pre suf, s = pre ++ suf ∧ (∀ c ∈ pre, okc .star c) ∧ f suf = true := by
  induction s with
  | nil =>
    simp only [anySuffix]
    constructor
    · intro h; exact ⟨[], [], rfl, by simp, h⟩
    · rintro ⟨pre, suf, hs, -, h⟩
      have hsuf : suf = [] := (List.append_eq_nil_iff.mp hs.symm).2
      subst hsuf; exact h
  | cons c s ih =>
    simp only [anySuffix, Bool.or_eq_true, ih]
    constructor
    · rintro (h | ⟨pre, suf, rfl, -, h⟩)
      · exact ⟨[], c :: s, rfl, by simp, h⟩
      · exact ⟨c :: pre, suf, rfl, fun _ _ => trivial, h⟩
    · rintro ⟨pre, suf, hs, -, h⟩
      cases pre with
      | nil => left; simp at hs; subst hs; exact h
      | cons d pre =>
        right; simp at hs; obtain ⟨rfl, rfl⟩ := hs
        exact ⟨pre, suf, rfl, fun _ _ => trivial, h⟩

theorem nAnySuffix_iff (f : List Char → Bool) (s : List Char) :
    nAnySuffix f s = true ↔
      ∃ pre suf, s = pre ++ suf ∧ (∀ c ∈ pre, okc .nstar c) ∧ f suf = true := by
  induction s with
  | nil =>
    simp only [nAnySuffix]
    constructor
    · intro h; exact ⟨[], [], rfl, by simp, h⟩
    · rintro ⟨pre, suf, hs, -, h⟩
      have hsuf : suf = [] := (List.append_eq_nil_iff.mp hs.symm).2
      subst hsuf; exact h
  | cons c s ih =>
    simp only [nAnySuffix, Bool.or_eq_true, Bool.and_eq_true, bne_iff_ne, ih]
    constructor
    · rintro (h | ⟨hc, pre, suf, rfl, hpre, h⟩)
      · exact ⟨[], c :: s, rfl, by simp, h⟩
      · refine ⟨c :: pre, suf, rfl, ?_, h⟩
        intro x hx
        simp only [List.mem_cons] at hx
        rcases hx with rfl | hx
        · exact hc
        · exact hpre x hx
    · rintro ⟨pre, suf, hs, hpre, h⟩
      cases pre with
      | nil => left; simp at hs; subst hs; exact h
      | cons d pre =>
        right; simp at hs; obtain ⟨rfl, rfl⟩ := hs
        exact ⟨hpre _ (by simp), pre, suf, rfl, fun x hx => hpre x (by simp [hx]), h⟩

/-- The executable matcher decides exactly the declarative meaning. -/
theorem globMatch_iff : ∀ (p : List Tok) (s : List Char), globMatch p s = true ↔ Matches p s
  | [], s => by
    cases s with
    | nil => simp [globMatch]; exact .nil
    | cons c s => simp [globMatch]; intro h; cases h
  | .star :: p, s => by
    rw [globMatch, anySuffix_iff]
    constructor
    · rintro ⟨pre, suf, rfl, hpre, h⟩
      exact sl_prefix rfl pre suf hpre ((globMatch_iff p suf).mp h)
    · intro h
      obtain ⟨pre, suf, rfl, hpre, hm⟩ := sl_inv rfl h
      exact ⟨pre, suf, rfl, hpre, (globMatch_iff p suf).mpr hm⟩
  | .nstar :: p, s => by
    rw [globMatch, nAnySuffix_iff]
    constructor
    · rintro ⟨pre, suf, rfl, hpre, h⟩
      exact sl_prefix rfl pre suf hpre ((globMatch_iff p suf).mp h)
    · intro h
      obtain ⟨pre, suf, rfl, hpre, hm⟩ := sl_inv rfl h
      exact ⟨pre, suf, rfl, hpre, (globMatch_iff p suf).mpr hm⟩
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

/-! Kernel checks. -/

/-- Compiles an IAM pattern: `*` is `star`, `?` is `one`, every other character is a literal. It never makes `nstar`. -/
def compile (s : String) : List Tok :=
  s.toList.map fun c => if c = '*' then .star else if c = '?' then .one else .lit c

/-- Every pattern matches some string. -/
theorem nonempty : ∀ p : List Tok, ∃ s, Matches p s
  | [] => ⟨[], .nil⟩
  | .lit c :: p => let ⟨s, h⟩ := nonempty p; ⟨c :: s, .lit h⟩
  | .one :: p => let ⟨s, h⟩ := nonempty p; ⟨'a' :: s, .one h⟩
  | .star :: p => let ⟨s, h⟩ := nonempty p; ⟨s, .starSkip h⟩
  | .nstar :: p => let ⟨s, h⟩ := nonempty p; ⟨s, .nstarSkip h⟩

/-- Matching a concatenation of patterns: split the string. Needed to read `<bucket>/` followed by any key. -/
theorem matches_append : ∀ (p q : List Tok) (s : List Char),
    Matches (p ++ q) s ↔ ∃ s1 s2, s = s1 ++ s2 ∧ Matches p s1 ∧ Matches q s2
  | [], q, s => by
    constructor
    · intro h; exact ⟨[], s, rfl, .nil, h⟩
    · rintro ⟨s1, s2, rfl, h1, h2⟩
      cases h1; exact h2
  | .lit c :: p, q, s => by
    constructor
    · intro h
      cases h with
      | @lit _ _ s' h =>
        obtain ⟨s1, s2, rfl, h1, h2⟩ := (matches_append p q s').mp h
        exact ⟨c :: s1, s2, rfl, .lit h1, h2⟩
    · rintro ⟨s1, s2, rfl, h1, h2⟩
      cases h1 with
      | @lit _ _ s1' h1 => exact .lit ((matches_append p q (s1' ++ s2)).mpr ⟨s1', s2, rfl, h1, h2⟩)
  | .one :: p, q, s => by
    constructor
    · intro h
      cases h with
      | @one d _ s' h =>
        obtain ⟨s1, s2, rfl, h1, h2⟩ := (matches_append p q s').mp h
        exact ⟨d :: s1, s2, rfl, .one h1, h2⟩
    · rintro ⟨s1, s2, rfl, h1, h2⟩
      cases h1 with
      | @one d _ s1' h1 => exact .one ((matches_append p q (s1' ++ s2)).mpr ⟨s1', s2, rfl, h1, h2⟩)
  | .star :: p, q, s => by
    constructor
    · intro h
      obtain ⟨pre, suf, rfl, hpre, h⟩ := sl_inv (t := .star) rfl h
      obtain ⟨s1, s2, rfl, h1, h2⟩ := (matches_append p q suf).mp h
      exact ⟨pre ++ s1, s2, by simp, sl_prefix rfl pre s1 hpre h1, h2⟩
    · rintro ⟨s1, s2, rfl, h1, h2⟩
      obtain ⟨pre, suf, rfl, hpre, h1⟩ := sl_inv (t := .star) rfl h1
      have := sl_prefix (p := p ++ q) (t := .star) rfl pre (suf ++ s2) hpre
        ((matches_append p q (suf ++ s2)).mpr ⟨suf, s2, rfl, h1, h2⟩)
      simpa using this
  | .nstar :: p, q, s => by
    constructor
    · intro h
      obtain ⟨pre, suf, rfl, hpre, h⟩ := sl_inv (t := .nstar) rfl h
      obtain ⟨s1, s2, rfl, h1, h2⟩ := (matches_append p q suf).mp h
      exact ⟨pre ++ s1, s2, by simp, sl_prefix rfl pre s1 hpre h1, h2⟩
    · rintro ⟨s1, s2, rfl, h1, h2⟩
      obtain ⟨pre, suf, rfl, hpre, h1⟩ := sl_inv (t := .nstar) rfl h1
      have := sl_prefix (p := p ++ q) (t := .nstar) rfl pre (suf ++ s2) hpre
        ((matches_append p q (suf ++ s2)).mpr ⟨suf, s2, rfl, h1, h2⟩)
      simpa using this

/-- A literal pattern matches exactly its own string. -/
theorem matches_lits (w s : List Char) : Matches (w.map .lit) s ↔ s = w := by
  induction w generalizing s with
  | nil => constructor
           · intro h; cases h; rfl
           · rintro rfl; exact .nil
  | cons c w ih =>
    constructor
    · intro h
      cases h with
      | @lit _ _ s' h => rw [(ih s').mp h]
    · rintro rfl; exact .lit ((ih w).mpr rfl)

/-! Kernel checks on real ARN patterns (regression examples, evaluated by the kernel). -/
/-- The ARN of a role, up to its name: `arn:<nstar>:iam:<nstar>:<nstar>:role/<name>`. -/
def roleArn (name : String) : List Tok :=
  compile "arn:" ++ [.nstar] ++ compile ":iam:" ++ [.nstar] ++ compile ":" ++ [.nstar] ++ compile (":role/" ++ name)

theorem checkPrefix : intersect (compile "arn:aws:iam::*:role/data-*") (roleArn "data-role") = true := by decide
theorem checkOtherPrefix : intersect (compile "arn:aws:iam::*:role/other-*") (roleArn "data-role") = false := by decide
theorem checkAllIam : intersect (compile "arn:aws:iam::*:*") (roleArn "data-role") = true := by decide
theorem checkRoleStar : intersect (compile "arn:aws:iam::*:role*") (roleArn "data-role") = true := by decide
theorem checkAccountColon : intersect (compile "arn:aws:iam::1:2:role/data-role") (roleArn "data-role") = false := by decide
theorem checkS3 : intersect (compile "arn:aws:s3:::b/*") (roleArn "data-role") = false := by decide
theorem checkPlainStars : intersect (compile "arn:aws:iam::*:role/other-*") (compile "arn:*:iam::*:role/data-role") = true := by decide

end ProofGate.Glob

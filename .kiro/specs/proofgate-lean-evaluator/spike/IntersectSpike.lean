/-! Intersect: decide whether two glob patterns have a common string.
Executable by the kernel (structural recursion on a fuel Nat), proved against `Matches`. -/
namespace Intersect

inductive Tok where
  | lit (c : Char)
  | one
  | star
  deriving Repr, DecidableEq

inductive Matches : List Tok → List Char → Prop where
  | nil : Matches [] []
  | lit {c p s} : Matches p s → Matches (.lit c :: p) (c :: s)
  | one {c p s} : Matches p s → Matches (.one :: p) (c :: s)
  | starSkip {p s} : Matches p s → Matches (.star :: p) s
  | starEat {c p s} : Matches (.star :: p) s → Matches (.star :: p) (c :: s)

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

/-- Fuel-bounded intersection test. Every recursive call removes one token in total,
so fuel `p.length + q.length + 1` is enough (`interF_complete`). -/
def interF : Nat → List Tok → List Tok → Bool
  | 0, _, _ => false
  | _+1, [], [] => true
  | n+1, [], .star :: q => interF n [] q
  | _+1, [], .one :: _ => false
  | _+1, [], .lit _ :: _ => false
  | n+1, .star :: p, [] => interF n p []
  | _+1, .one :: _, [] => false
  | _+1, .lit _ :: _, [] => false
  | n+1, .star :: p, .star :: q => interF n p (.star :: q) || interF n (.star :: p) q
  | n+1, .star :: p, .one :: q => interF n p (.one :: q) || interF n (.star :: p) q
  | n+1, .star :: p, .lit d :: q => interF n p (.lit d :: q) || interF n (.star :: p) q
  | n+1, .one :: p, .star :: q => interF n (.one :: p) q || interF n p (.star :: q)
  | n+1, .lit c :: p, .star :: q => interF n (.lit c :: p) q || interF n p (.star :: q)
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
  | _+1, [], .one :: _, h => by simp [interF] at h
  | _+1, [], .lit _ :: _, h => by simp [interF] at h
  | n+1, .star :: p, [], h => by
    simp only [interF] at h
    obtain ⟨s, hp, hq⟩ := interF_sound n p [] h
    cases hq
    exact ⟨[], .starSkip hp, .nil⟩
  | _+1, .one :: _, [], h => by simp [interF] at h
  | _+1, .lit _ :: _, [], h => by simp [interF] at h
  | n+1, .star :: p, .star :: q, h => by
    simp only [interF, Bool.or_eq_true] at h
    rcases h with h | h
    · obtain ⟨s, hp, hq⟩ := interF_sound n p (.star :: q) h
      exact ⟨s, .starSkip hp, hq⟩
    · obtain ⟨s, hp, hq⟩ := interF_sound n (.star :: p) q h
      exact ⟨s, hp, .starSkip hq⟩
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
  | _+1, [], .one :: _, _, _, hp, hq => by cases hp; cases hq
  | _+1, [], .lit _ :: _, _, _, hp, hq => by cases hp; cases hq
  | n+1, .star :: p, [], hn, _, hp, hq => by
    cases hq
    cases hp with
    | starSkip hp' =>
      simp only [interF]
      exact interF_complete n p []
        (by simp only [List.length_cons, List.length_nil] at *; omega) [] hp' .nil
  | _+1, .one :: _, [], _, _, hp, hq => by cases hq; cases hp
  | _+1, .lit _ :: _, [], _, _, hp, hq => by cases hq; cases hp
  | n+1, .star :: p, .star :: q, hn, _, hp, hq => by
    simp only [interF, Bool.or_eq_true]
    obtain ⟨a, s1, rfl, hp'⟩ := star_inv hp
    obtain ⟨b, s2, hs, hq'⟩ := star_inv hq
    rcases List.append_eq_append_iff.mp hs with ⟨m, rfl, rfl⟩ | ⟨m, rfl, rfl⟩
    · left
      exact interF_complete n p (.star :: q)
        (by simp only [List.length_cons] at *; omega) _ hp' (star_prefix m s2 hq')
    · right
      exact interF_complete n (.star :: p) q
        (by simp only [List.length_cons] at *; omega) _ (star_prefix m s1 hp') hq'
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

def compile (s : String) : List Tok :=
  s.toList.map fun c => if c = '*' then .star else if c = '?' then .one else .lit c

theorem check1 : intersect (compile "arn:aws:s3:::proofgate-protected-data/*")
    (compile "arn:aws:s3:::proofgate-protected-data/reports/*") = true := by decide
theorem check2 : intersect (compile "arn:aws:s3:::other-bucket/*")
    (compile "arn:aws:s3:::proofgate-protected-data/*") = false := by decide
theorem check3 : intersect (compile "arn:aws:iam::*:role/proofgate-*")
    (compile "arn:aws:iam::123456789012:role/proofgate-protected-data-role") = true := by decide
theorem check4 : intersect (compile "arn:aws:iam::*:role/ci-*")
    (compile "arn:aws:iam::*:role/data-*") = true := by decide
theorem check5 : intersect (compile "a?c") (compile "ab") = false := by decide

end Intersect

import Table
import Table2
/-! Speed probe 2: (a) native_decide on the flat table; (b) kernel on the table indexed by service prefix. -/
namespace Perf2

inductive Tok where
  | lit (c : Char)
  | one
  | star
  deriving DecidableEq

def anySuffix (f : List Char → Bool) : List Char → Bool
  | [] => f []
  | c :: s => f (c :: s) || anySuffix f s

def globMatch : List Tok → List Char → Bool
  | [], s => s.isEmpty
  | .star :: p, s => anySuffix (globMatch p) s
  | .one :: _, [] => false
  | .one :: p, _ :: s => globMatch p s
  | .lit _ :: _, [] => false
  | .lit c :: p, d :: s => c == d && globMatch p s

def compile (s : String) : List Tok :=
  s.toList.map fun c => if c = '*' then .star else if c = '?' then .one else .lit c

def launchableFlat (patterns : List (List Tok)) : List String :=
  (launchTable.filter fun (a, _) => patterns.any fun p => globMatch p a.toList).flatMap (·.2)

/-- A pattern as (literal service prefix, pattern of the rest), when the part before ':' has no wildcard. -/
def splitPrefix : List Tok → Option (List Char × List Tok)
  | [] => none
  | .lit ':' :: rest => some ([], rest)
  | .lit c :: rest => (splitPrefix rest).map fun (pre, r) => (c :: pre, r)
  | _ => none

def launchableIndexed (patterns : List (List Tok)) : List String :=
  patterns.flatMap fun p =>
    match splitPrefix p with
    | some (pre, rest) =>
      (launchGroups.filter fun (g, _) => g.toList == pre).flatMap fun (_, xs) =>
        (xs.filter fun (n, _) => globMatch rest n.toList).flatMap (·.2)
    | none => launchableFlat [p]

def demoPatterns : List (List Tok) :=
  ["iam:passrole", "lambda:createfunction", "lambda:updatefunctioncode", "lambda:invokefunction"].map compile

theorem flatNative : (launchableFlat demoPatterns).contains "lambda.amazonaws.com" = true := by native_decide
theorem indexedKernel : (launchableIndexed demoPatterns).contains "lambda.amazonaws.com" = true := by decide +kernel
theorem indexedKernelNeg : (launchableIndexed demoPatterns).contains "ecs-tasks.amazonaws.com" = false := by decide +kernel

end Perf2

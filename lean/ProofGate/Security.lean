import ProofGate.Model

namespace ProofGate

-- The Security module provides functions and theorems to analyze the security of a system based on the defined EscalationPath structure.
def isEscalation (path : EscalationPath) : Bool :=
  path.canPassRole && path.canControlLambda && path.targetIsLambdaAssumable && path.targetCanAccess

-- The safe function checks if a list of EscalationPaths is safe, meaning that none of the paths represent an escalation.
def safe (paths : List EscalationPath) : Bool :=
  paths.all fun path => !(isEscalation path)

theorem emptyModelIsSafeAtBooleanLevel : safe [] = true := by
  native_decide

theorem completeEscalationIsUnsafe (principal target resource : String) :
    safe [{
      principal := principal
      target := target
      protectedResource := resource
      canPassRole := true
      canControlLambda := true
      targetIsLambdaAssumable := true
      targetCanAccess := true
    }] = false := by
  simp [safe, isEscalation]

end ProofGate

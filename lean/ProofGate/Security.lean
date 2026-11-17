import ProofGate.Model

namespace ProofGate

def isEscalation (path : EscalationPath) : Bool :=
  path.canPassRole && path.canControlLambda && path.targetIsLambdaAssumable && path.targetCanAccess

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

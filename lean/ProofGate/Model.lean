namespace ProofGate

structure EscalationPath where
  principal : String
  target : String
  protectedResource : String
  canPassRole : Bool
  canControlLambda : Bool
  targetIsLambdaAssumable : Bool
  targetCanAccess : Bool
  deriving Repr, DecidableEq

end ProofGate

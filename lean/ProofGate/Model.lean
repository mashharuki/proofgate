namespace ProofGate

-- EscalationPath represents a path of escalation from one principal to a target principal, with information about the protected resource and the capabilities of the principals involved.
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

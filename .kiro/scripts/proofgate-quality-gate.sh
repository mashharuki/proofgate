#!/usr/bin/env bash
# ProofGate quality gate, run by the Kiro hook `proofgate-quality-gate` after a spec task.
#
# Runs the existing repository checks in order and stops at the first failure:
#   pnpm quality, pnpm typecheck, pnpm test, pnpm pack:check
#
# It does not fix files, commit, or push. It writes only a log file outside the repository.
# Exit code 0: all checks passed. Exit code 1: a check failed or the environment is unsupported.
# On failure, the message goes to stderr, which Kiro passes to the agent.
set -u

REQUIRED_NODE_MAJOR=26
LOG_FILE="${TMPDIR:-/tmp}/proofgate-quality-gate.log"

# Always run from the project root, whatever the caller's directory is.
cd "$(dirname "$0")/../.." || {
  echo "ProofGate quality gate: cannot change to the project root." >&2
  exit 1
}

fail() {
  echo "ProofGate quality gate FAILED: $1" >&2
  echo "Do not mark the spec task as complete. Fix the cause, then run the failed command again." >&2
  exit 1
}

# Stdin carries the hook event as JSON. It is not needed here, so discard it.
cat >/dev/null 2>&1 || true

# --- Environment checks ---------------------------------------------------------------------
command -v node >/dev/null 2>&1 \
  || fail "node was not found on PATH. Install Node.js ${REQUIRED_NODE_MAJOR} or later (.nvmrc pins the version) and make it available to Kiro."

node_version="$(node --version 2>/dev/null)"
node_major="${node_version#v}"
node_major="${node_major%%.*}"
case "$node_major" in
  '' | *[!0-9]*) fail "could not read the Node.js version (got '${node_version}')." ;;
esac
if [ "$node_major" -lt "$REQUIRED_NODE_MAJOR" ]; then
  fail "Node.js ${REQUIRED_NODE_MAJOR} or later is required, but Kiro's shell uses ${node_version}. Run 'nvm use' in the project root (.nvmrc pins $(cat .nvmrc 2>/dev/null || echo '26.x')) or start Kiro from a shell that uses it."
fi

command -v pnpm >/dev/null 2>&1 \
  || fail "pnpm was not found on PATH. Install pnpm 11 (the packageManager field in package.json pins the version)."

# --- Checks ------------------------------------------------------------------------------------
: >"$LOG_FILE" || fail "cannot write the log file ${LOG_FILE}."
echo "ProofGate quality gate: Node.js ${node_version}, log: ${LOG_FILE}"

run_step() {
  step_name="$1"
  shift
  started=$SECONDS
  echo "--- ${step_name}" >>"$LOG_FILE"
  if "$@" >>"$LOG_FILE" 2>&1; then
    echo "PASS ${step_name} ($((SECONDS - started))s)"
  else
    status=$?
    {
      echo "ProofGate quality gate FAILED at '${step_name}' (exit code ${status}, $((SECONDS - started))s)."
      echo "Last lines of the output (full log: ${LOG_FILE}):"
      tail -n 40 "$LOG_FILE"
      echo "Do not mark the spec task as complete. Fix the cause, then run '${step_name}' again."
    } >&2
    exit 1
  fi
}

run_step "pnpm quality" pnpm quality
run_step "pnpm typecheck" pnpm typecheck
run_step "pnpm test" pnpm test
run_step "pnpm pack:check" pnpm pack:check

echo "ProofGate quality gate PASSED: quality, typecheck, test, pack:check."

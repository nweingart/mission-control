#!/usr/bin/env bash
#
# Mission Control — End-to-End Demo Script
# Forks a Vercel repo, scans it, plans tasks, builds them, and opens a PR.
# Usage: ./scripts/e2e-demo.sh [upstream_repo] [feature_description]
#
# Defaults:
#   repo: vercel/serve
#   feature: "Add a --cors flag that enables permissive CORS headers for local dev"
#
set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────
UPSTREAM="${1:-vercel/serve}"
FEATURE="${2:-Add a --cors flag that enables permissive CORS headers for local development servers}"
REPO_NAME="$(basename "$UPSTREAM")"
GH_USER="$(gh api user --jq '.login')"
WORKSPACE="/tmp/mc-e2e-demo"
PROJECT_DIR="$WORKSPACE/$REPO_NAME"
BRANCH_NAME="feature/mc-demo-$(date +%s)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

step() { echo -e "\n${GREEN}${BOLD}▸ $1${RESET}"; }
info() { echo -e "  ${DIM}$1${RESET}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${RESET}"; }
fail() { echo -e "\n${RED}✖ $1${RESET}"; exit 1; }
elapsed() { echo -e "  ${CYAN}⏱  ${1}s elapsed${RESET}"; }

# Helper: run claude --print (read-only, for analysis)
claude_read() {
  local dir="$1"
  local prompt="$2"
  (
    cd "$dir"
    unset CLAUDE_CODE_ENTRYPOINT CLAUDECODE 2>/dev/null || true
    claude --print --output-format text -p "$prompt" 2>/dev/null
  )
}

# Helper: run claude with file write permissions
claude_write() {
  local dir="$1"
  local prompt="$2"
  (
    cd "$dir"
    unset CLAUDE_CODE_ENTRYPOINT CLAUDECODE 2>/dev/null || true
    claude --print --output-format text --dangerously-skip-permissions -p "$prompt" 2>/dev/null
  )
}

START_TIME=$SECONDS

# ── Step 1: Fork & Clone ────────────────────────────────────────────
step "Forking $UPSTREAM → $GH_USER/$REPO_NAME"

gh repo fork "$UPSTREAM" --clone=false 2>/dev/null || true
info "Fork ready at $GH_USER/$REPO_NAME"

# Sync fork with upstream
gh repo sync "$GH_USER/$REPO_NAME" 2>/dev/null || true

rm -rf "$PROJECT_DIR"
mkdir -p "$WORKSPACE"

step "Cloning $GH_USER/$REPO_NAME"
git clone --depth 50 "https://github.com/$GH_USER/$REPO_NAME.git" "$PROJECT_DIR" 2>&1 | tail -2
cd "$PROJECT_DIR"

FILE_COUNT=$(find . -type f -not -path '*/.git/*' -not -path '*/node_modules/*' | wc -l | tr -d ' ')
info "Cloned to $PROJECT_DIR ($FILE_COUNT files)"
elapsed $((SECONDS - START_TIME))

# ── Step 2: Install deps ────────────────────────────────────────────
step "Installing dependencies"
cd "$PROJECT_DIR"
npm install 2>&1 | tail -3 || warn "npm install had warnings (non-fatal)"
elapsed $((SECONDS - START_TIME))

# ── Step 3: Scan / Discover ─────────────────────────────────────────
step "Scanning codebase with Claude"

SCAN_RESULT=$(claude_read "$PROJECT_DIR" "Read through this entire codebase and analyze it. Tell me:
1. What is this project? What does it do?
2. What is the tech stack (language, framework, build tools, test framework)?
3. List every source file and its purpose.
4. Identify any code issues (bugs, security problems, missing error handling, dead code).
5. Summarize in one paragraph.

Be thorough — read every file in source/ and tests/.") || fail "Scan failed"

echo "$SCAN_RESULT" | head -40
echo -e "  ${DIM}... ($(echo "$SCAN_RESULT" | wc -l | tr -d ' ') lines total)${RESET}"
elapsed $((SECONDS - START_TIME))

# ── Step 4: Plan tasks for the feature ──────────────────────────────
step "Planning tasks for: $FEATURE"

PLAN_RESULT=$(claude_read "$PROJECT_DIR" "I want to add this feature to this codebase:

$FEATURE

Read the codebase first to understand the patterns, then break this into 2-4 small implementation tasks. For each task, specify exactly which files to create or modify.

Return a numbered list like:
1. [Task title] — [description, files to touch]
2. [Task title] — [description, files to touch]
...

Be specific about file paths based on the actual project structure you see.") || fail "Planning failed"

echo "$PLAN_RESULT"
elapsed $((SECONDS - START_TIME))

# ── Step 5: Create feature branch ───────────────────────────────────
step "Creating branch: $BRANCH_NAME"
cd "$PROJECT_DIR"
git checkout -b "$BRANCH_NAME" 2>&1
info "On branch $BRANCH_NAME"

# ── Step 6: Build the feature ───────────────────────────────────────
step "Building feature with Claude (writing code)"
info "This step makes actual file changes..."

BUILD_RESULT=$(claude_write "$PROJECT_DIR" "I'm adding this feature to this codebase:

$FEATURE

Here is the implementation plan:
$PLAN_RESULT

Implement ALL of these tasks now. Make the changes directly in the codebase. Follow the existing code style and patterns exactly. Add tests if the project has a test suite.

Important:
- Read existing files before modifying them
- Follow existing naming conventions and patterns
- Keep changes minimal and focused
- Make sure all imports are correct
- Do not break existing functionality
- Do not create unnecessary files") || fail "Build failed"

echo "$BUILD_RESULT" | tail -30
elapsed $((SECONDS - START_TIME))

# ── Step 7: Check for changes ───────────────────────────────────────
step "Reviewing changes"
cd "$PROJECT_DIR"

DIFF=$(git diff)
DIFF_STAT=$(git diff --stat)

if [ -z "$DIFF" ]; then
  # Also check for untracked files
  UNTRACKED=$(git ls-files --others --exclude-standard)
  if [ -z "$UNTRACKED" ]; then
    fail "No changes were made. Build may have failed silently."
  fi
  info "New files created:"
  echo "$UNTRACKED"
  git add -A
  DIFF=$(git diff --cached)
  DIFF_STAT=$(git diff --cached --stat)
fi

echo "$DIFF_STAT"
echo ""

# Quick review
REVIEW_RESULT=$(claude_read "$PROJECT_DIR" "Review this diff. List any bugs, security issues, or quality concerns. Be concise — bullet points only.

\`\`\`diff
$(echo "$DIFF" | head -300)
\`\`\`") || warn "Review failed (non-fatal)"

echo "$REVIEW_RESULT" | head -15
elapsed $((SECONDS - START_TIME))

# ── Step 8: Commit & Push ───────────────────────────────────────────
step "Committing and pushing"
cd "$PROJECT_DIR"
git add -A
git commit -m "feat: add --cors flag for local dev CORS headers" \
  -m "Implemented via Mission Control e2e demo pipeline." \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>" 2>&1 | tail -3
git push -u origin "$BRANCH_NAME" 2>&1 | tail -3
info "Pushed to origin/$BRANCH_NAME"
elapsed $((SECONDS - START_TIME))

# ── Step 9: Open PR ─────────────────────────────────────────────────
step "Opening pull request"

PR_URL=$(gh pr create \
  --repo "$GH_USER/$REPO_NAME" \
  --title "feat: add --cors flag for local dev CORS headers" \
  --body "$(cat <<'PRBODY'
## Summary

Adds a `--cors` flag to `serve` that enables permissive CORS headers (`Access-Control-Allow-Origin: *`) when serving files locally. Useful for frontend developers testing against local API mocks or loading assets cross-origin during development.

## What changed

- Added `--cors` CLI flag parsing
- Added CORS header injection middleware
- Added tests for CORS behavior

## Process

Built using [Mission Control](https://github.com/nweingart/mission-control) — an AI-powered build orchestration tool:

1. **Scanned** the codebase to understand architecture and patterns
2. **Planned** implementation as discrete tasks with file manifests
3. **Built** all tasks with Claude Code (parallel DAG execution)
4. **Reviewed** automatically for quality and security

---
🤖 Generated with Mission Control
PRBODY
)" \
  --head "$BRANCH_NAME" \
  --base main 2>&1) || fail "PR creation failed"

echo -e "\n${GREEN}${BOLD}✔ PR created: $PR_URL${RESET}"

# ── Done ─────────────────────────────────────────────────────────────
TOTAL=$((SECONDS - START_TIME))
echo -e "\n${GREEN}${BOLD}═══════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  Demo complete in ${TOTAL}s ($(( TOTAL / 60 ))m $(( TOTAL % 60 ))s)${RESET}"
echo -e "${GREEN}${BOLD}  PR: $PR_URL${RESET}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${RESET}"

#!/usr/bin/env bash
#
# Create a new GitHub repo from your template and clone it locally.
#
# Usage:
#   ./scripts/create-test-repo.sh Test_1
#   ./scripts/create-test-repo.sh Test_2
#   ./scripts/create-test-repo.sh "FoodPro Invoice Processing"
#
# Prerequisites:
#   - GitHub CLI (gh) installed: https://cli.github.com/
#   - Authenticated: run 'gh auth login' once
#
# What this does:
#   1. Creates a new repo from your template in your GitHub org
#   2. Clones it locally
#   3. Creates dev/test/stage branches
#   4. Copies the test manifest into the new repo
#   5. Tells you what to do next
#

set -euo pipefail

# ============================================================================
# CONFIGURATION — Change these to match your setup
# ============================================================================

# Your GitHub org or personal account
GITHUB_OWNER="harvardrpa"

# The template repo to create from
TEMPLATE_REPO="${GITHUB_OWNER}/RPA_HarvardUnifiedFrameworkTemplate"

# Where to clone repos locally
CLONE_DIR="."

# Repo visibility (private, public, or internal)
VISIBILITY="private"

# ============================================================================
# Script
# ============================================================================

if [ $# -lt 1 ]; then
  echo "Usage: $0 <repo-name> [iteration-number]"
  echo ""
  echo "Examples:"
  echo "  $0 Test_1"
  echo "  $0 Test_2"
  echo "  $0 MyAutomation"
  exit 1
fi

REPO_NAME="$1"
ITERATION="${2:-1}"

echo "============================================"
echo "Creating repo: ${GITHUB_OWNER}/${REPO_NAME}"
echo "From template: ${TEMPLATE_REPO}"
echo "============================================"
echo ""

# Check prerequisites
if ! command -v gh &> /dev/null; then
  echo "ERROR: GitHub CLI (gh) is not installed."
  echo ""
  echo "Install it:"
  echo "  Windows (winget): winget install --id GitHub.cli"
  echo "  Windows (choco):  choco install gh"
  echo "  Mac (brew):       brew install gh"
  echo ""
  echo "Then authenticate:  gh auth login"
  exit 1
fi

if ! gh auth status &> /dev/null; then
  echo "ERROR: Not authenticated with GitHub CLI."
  echo "Run: gh auth login"
  exit 1
fi

# Step 1: Create repo from template
echo "[1/5] Creating repo from template..."
gh repo create "${GITHUB_OWNER}/${REPO_NAME}" \
  --template "${TEMPLATE_REPO}" \
  --"${VISIBILITY}" \
  --clone

cd "${CLONE_DIR}/${REPO_NAME}"

# Step 2: Create branches (dev, test, stage) if they don't exist
echo ""
echo "[2/5] Creating branches..."
for BRANCH in dev test stage; do
  if git show-ref --verify --quiet "refs/heads/${BRANCH}" 2>/dev/null; then
    echo "  Branch '${BRANCH}' already exists"
  else
    git checkout -b "${BRANCH}" main 2>/dev/null || git checkout -b "${BRANCH}"
    echo "  Created branch '${BRANCH}'"
  fi
done

# Push all branches
echo ""
echo "[3/5] Pushing branches..."
for BRANCH in dev test stage main; do
  git push -u origin "${BRANCH}" 2>/dev/null || true
done

# Step 4: Switch to dev and update the manifest for this test
git checkout dev
echo ""
echo "[4/5] Updating orchestrator-manifest.json for ${REPO_NAME}..."

if [ -f orchestrator-manifest.json ]; then
  # Replace project name and folder path with test-specific values
  # Using a simple sed replacement — works for the template format
  if command -v sed &> /dev/null; then
    sed -i.bak \
      -e "s/\"project\": \".*\"/\"project\": \"${REPO_NAME}\"/" \
      -e "s|\"folderPath\": \".*\"|\"folderPath\": \"Unattended Automations/${REPO_NAME}\"|" \
      orchestrator-manifest.json
    rm -f orchestrator-manifest.json.bak

    # Replace all resource names with test-specific names
    sed -i.bak \
      -e "s/Test_1/${REPO_NAME}/g" \
      -e "s/FoodPro/${REPO_NAME}/g" \
      orchestrator-manifest.json
    rm -f orchestrator-manifest.json.bak
  fi
  echo "  Updated manifest for ${REPO_NAME}"
else
  echo "  WARNING: No orchestrator-manifest.json found. You'll need to create one."
fi

# Step 5: Summary
echo ""
echo "[5/5] Done!"
echo ""
echo "============================================"
echo "REPO CREATED: ${GITHUB_OWNER}/${REPO_NAME}"
echo "LOCAL PATH:   $(pwd)"
echo "BRANCH:       dev"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Review orchestrator-manifest.json (it's been updated for ${REPO_NAME})"
echo "  2. Make sure GitHub Secrets are set on this repo (or inherited from the org):"
echo "     - ORCHESTRATOR_DEV_CLIENT_ID"
echo "     - ORCHESTRATOR_DEV_CLIENT_SECRET"
echo "  3. Make sure GitHub Variables are set:"
echo "     - ORCHESTRATOR_BASE_URL"
echo "     - ORCHESTRATOR_IDENTITY_URL"
echo "     - ORCHESTRATOR_SCOPES"
echo "  4. Commit and push to dev to trigger the pipeline:"
echo "     git add -A"
echo "     git commit -m 'Initial setup for ${REPO_NAME}'"
echo "     git push origin dev"
echo "  5. Watch the Actions tab on GitHub"
echo ""

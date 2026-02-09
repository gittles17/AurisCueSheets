#!/bin/bash
# test-update-install.sh
# Verifies the manual extract-and-swap update mechanism works correctly.
# Usage: bash scripts/test-update-install.sh [path-to-zip]
# Default ZIP: /tmp/auris-build/Auris Cue Sheets-v*-arm64.zip

set -euo pipefail

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# Find ZIP
if [ -n "${1:-}" ]; then
  ZIP_PATH="$1"
else
  ZIP_PATH=$(ls /tmp/auris-build/Auris\ Cue\ Sheets-v*-arm64.zip 2>/dev/null | head -1)
fi

echo "=== Update Install Mechanism Test ==="
echo ""

# Step 1: ZIP exists
echo "[1] Checking ZIP file..."
if [ -z "$ZIP_PATH" ] || [ ! -f "$ZIP_PATH" ]; then
  fail "ZIP file not found: ${ZIP_PATH:-<none>}"
  echo ""
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
SIZE=$(du -h "$ZIP_PATH" | cut -f1)
pass "ZIP exists: $ZIP_PATH ($SIZE)"

# Step 2: Extract with ditto
TEMP_DIR="/tmp/auris-update-test-$$"
echo "[2] Extracting with ditto..."
mkdir -p "$TEMP_DIR"
if ditto -xk "$ZIP_PATH" "$TEMP_DIR" 2>/dev/null; then
  pass "ditto extraction succeeded"
else
  fail "ditto extraction failed"
  rm -rf "$TEMP_DIR"
  echo ""
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Step 3: Find .app
echo "[3] Looking for .app bundle..."
APP_NAME=$(ls "$TEMP_DIR" | grep '\.app$' | head -1)
if [ -n "$APP_NAME" ]; then
  pass "Found app: $APP_NAME"
else
  fail "No .app found in extracted ZIP"
  ls -la "$TEMP_DIR"
  rm -rf "$TEMP_DIR"
  echo ""
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Step 4: Verify binary exists
echo "[4] Checking app binary..."
BINARY="$TEMP_DIR/$APP_NAME/Contents/MacOS/Auris Cue Sheets"
if [ -f "$BINARY" ]; then
  pass "Main binary exists"
else
  fail "Main binary not found at: $BINARY"
fi

# Step 5: Verify Info.plist
echo "[5] Checking Info.plist..."
PLIST="$TEMP_DIR/$APP_NAME/Contents/Info.plist"
if [ -f "$PLIST" ]; then
  VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$PLIST" 2>/dev/null || echo "unknown")
  pass "Info.plist exists (version: $VERSION)"
else
  fail "Info.plist not found"
fi

# Step 6: Verify Resources (.env bundled)
echo "[6] Checking bundled resources..."
ENV_FILE="$TEMP_DIR/$APP_NAME/Contents/Resources/.env"
if [ -f "$ENV_FILE" ]; then
  pass ".env bundled in Resources"
else
  fail ".env not found in Resources"
fi

# Step 7: Test xattr removal
echo "[7] Testing xattr removal..."
if xattr -cr "$TEMP_DIR/$APP_NAME" 2>/dev/null; then
  pass "xattr -cr succeeded"
else
  fail "xattr -cr failed"
fi

# Step 8: Test swap simulation
echo "[8] Simulating app swap..."
MOCK_CURRENT="/tmp/auris-mock-app-$$.app"
mkdir -p "$MOCK_CURRENT/Contents/MacOS"
echo "old-binary" > "$MOCK_CURRENT/Contents/MacOS/mock"

BACKUP="$MOCK_CURRENT.bak"
rm -rf "$BACKUP"
mv "$MOCK_CURRENT" "$BACKUP"
mv "$TEMP_DIR/$APP_NAME" "$MOCK_CURRENT"
rm -rf "$BACKUP"

if [ -f "$MOCK_CURRENT/Contents/MacOS/Auris Cue Sheets" ]; then
  pass "Swap simulation succeeded (new binary in place)"
else
  fail "Swap simulation failed (binary not found after swap)"
fi

# Step 9: Test open command (dry run)
echo "[9] Verifying open command would work..."
if command -v open >/dev/null 2>&1; then
  pass "'open' command available"
else
  fail "'open' command not found"
fi

# Cleanup
rm -rf "$TEMP_DIR" "$MOCK_CURRENT"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -eq 0 ]; then
  echo "ALL TESTS PASSED"
  exit 0
else
  echo "SOME TESTS FAILED"
  exit 1
fi

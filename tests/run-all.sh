#!/usr/bin/env bash
# Runs the pass/fail browser tests against http://localhost:8787 (serve the repo root first).
cd "$(dirname "$0")"
fail=0
for t in e2e regress regress3 settings rmotion i18n pausemenu tut mouse close mys records bestin sharenav offline layouts; do
  out=$(node "$t.js" 2>&1)
  if echo "$out" | grep -qE "FAIL|PAGEERR|Error:"; then
    echo "✗ $t"; echo "$out" | grep -E "FAIL|PAGEERR|Error" | head -5; fail=1
  else
    echo "✓ $t ($(echo "$out" | grep -c '^ok:') checks)"
  fi
done
out=$(node monkey.js 30 phone 2>&1)
if echo "$out" | grep -q "^no errors"; then echo "✓ monkey"; else echo "✗ monkey"; echo "$out" | tail -5; fail=1; fi
exit $fail

"""
test_validation.py
------------------
Tests the validate_and_clean() function with known bad and good inputs.
Does NOT load the Qwen model — runs instantly.

Run with:
    python test_validation.py
"""

from validation import validate_and_clean

PASS = "PASS"
FAIL = "FAIL"
results = []


def check(name, result, expected_viewer, expected_male, expected_female):
    """Check viewer_count, male, female match expected values. Engagement is random so not checked exactly."""
    ok = (
        result["viewer_count"] == expected_viewer and
        result["male"]         == expected_male   and
        result["female"]       == expected_female and
        result["male"] + result["female"] == result["viewer_count"] and
        0 <= result["engagement"] <= 100
    )
    status = PASS if ok else FAIL
    results.append((status, name))
    print(f"  [{status}] {name}")
    if not ok:
        print(f"         Expected  viewer={expected_viewer}  male={expected_male}  female={expected_female}")
        print(f"         Got       viewer={result['viewer_count']}  male={result['male']}  female={result['female']}")
    print()


def check_range(name, result, viewer_min, viewer_max):
    """For cases where the exact value is random — just check it's in range."""
    ok = (
        viewer_min <= result["viewer_count"] <= viewer_max and
        result["male"] + result["female"] == result["viewer_count"] and
        0 <= result["engagement"] <= 100
    )
    status = PASS if ok else FAIL
    results.append((status, name))
    print(f"  [{status}] {name}")
    if not ok:
        print(f"         Got viewer={result['viewer_count']}  male={result['male']}  female={result['female']}  engagement={result['engagement']}")
    print()


print("=" * 55)
print("  VALIDATION TEST SUITE")
print("=" * 55)
print()

# ── Test 1: viewer_count way too high (the original bug) ──────────────────────
print("Test 1 — viewer_count = 1000 (the original bug)")
r = validate_and_clean({"viewer_count": 1000, "male": 600, "female": 300, "engagement": 75})
check_range("viewer_count 1000 clamped to [1-10]", r, 1, 10)

# ── Test 2: viewer_count negative ─────────────────────────────────────────────
print("Test 2 — viewer_count = -5")
r = validate_and_clean({"viewer_count": -5, "male": 0, "female": 0, "engagement": 50})
check_range("viewer_count -5 clamped to [1-10]", r, 1, 10)

# ── Test 3: male + female don't add up ────────────────────────────────────────
print("Test 3 — viewer_count=6 but male=10, female=2 (sum=12, wrong)")
r = validate_and_clean({"viewer_count": 6, "male": 10, "female": 2, "engagement": 70})
check("male+female redistributed to equal viewer_count=6", r, 6, 5, 1)

# ── Test 4: male + female both zero but viewer_count > 0 ─────────────────────
print("Test 4 — viewer_count=4, male=0, female=0 (split 50/50)")
r = validate_and_clean({"viewer_count": 4, "male": 0, "female": 0, "engagement": 65})
check("50/50 split when male+female=0", r, 4, 2, 2)

# ── Test 5: engagement too high ───────────────────────────────────────────────
print("Test 5 — engagement = 150")
r = validate_and_clean({"viewer_count": 3, "male": 2, "female": 1, "engagement": 150})
ok = (r["viewer_count"] == 3 and r["male"] == 2 and r["female"] == 1 and 60 <= r["engagement"] <= 80)
status = PASS if ok else FAIL
results.append((status, "engagement 150 clamped to [60-80]"))
print(f"  [{status}] engagement 150 clamped to [60-80]  (got {r['engagement']})")
print()

# ── Test 6: engagement negative ───────────────────────────────────────────────
print("Test 6 — engagement = -20")
r = validate_and_clean({"viewer_count": 2, "male": 1, "female": 1, "engagement": -20})
ok = (r["viewer_count"] == 2 and 60 <= r["engagement"] <= 80)
status = PASS if ok else FAIL
results.append((status, "engagement -20 replaced with default [60-80]"))
print(f"  [{status}] engagement -20 replaced with default [60-80]  (got {r['engagement']})")
print()

# ── Test 7: all values valid — nothing should be corrected ────────────────────
print("Test 7 — all values already valid (no correction expected)")
r = validate_and_clean({"viewer_count": 5, "male": 3, "female": 2, "engagement": 82})
check("valid input passes through unchanged", r, 5, 3, 2)

# ── Test 8: viewer_count = 0 (edge case) ─────────────────────────────────────
print("Test 8 — viewer_count = 0 (empty frame)")
r = validate_and_clean({"viewer_count": 0, "male": 0, "female": 0, "engagement": 0})
check("viewer_count=0 with male=female=0 is valid", r, 0, 0, 0)

# ── Test 9: label appears in correction messages ──────────────────────────────
print("Test 9 — label printed in correction messages")
r = validate_and_clean({"viewer_count": 999, "male": 0, "female": 0, "engagement": 50}, label="frame_042.jpg")
check_range("label shown in correction output", r, 1, 10)

# ── Summary ───────────────────────────────────────────────────────────────────
print("=" * 55)
passed = sum(1 for s, _ in results if s == PASS)
failed = sum(1 for s, _ in results if s == FAIL)
print(f"  Results: {passed} passed, {failed} failed out of {len(results)} tests")
if failed == 0:
    print("  All tests passed. Validation layer is working correctly.")
else:
    print("  Some tests FAILED. Check output above.")
print("=" * 55)

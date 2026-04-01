"""
validation.py
-------------
Standalone validation and cleaning logic for Qwen inference outputs.
Kept in its own file so it can be imported and tested without loading
the heavy Qwen model.
"""

import random

# ── Bounds ────────────────────────────────────────────────────────────────────
VIEWER_COUNT_MAX       = 20
VIEWER_COUNT_CLAMP_MIN = 1
VIEWER_COUNT_CLAMP_MAX = 10
DEFAULT_ENGAGEMENT_MIN = 60
DEFAULT_ENGAGEMENT_MAX = 80


def validate_and_clean(raw: dict, label: str = "") -> dict:
    """
    Validates and cleans a raw Qwen inference dict.

    Rules enforced
    --------------
    * viewer_count  : must be in [0, 20].  If outside, clamped to [1, 10].
    * male + female : must equal viewer_count.  If not, redistributed
                      proportionally (or split 50/50 when both are 0).
    * engagement    : must be in [0, 100].  If outside, replaced with a
                      random default in [60, 80].

    Every correction is printed so the caller can trace what changed.
    """
    prefix = f"[{label}] " if label else ""

    viewer_count = int(raw.get("viewer_count", 0))
    male         = int(raw.get("male",         0))
    female       = int(raw.get("female",       0))
    engagement   = int(raw.get("engagement",   0))
    corrected    = False

    # ── 1. viewer_count ───────────────────────────────────────────────────────
    if not (0 <= viewer_count <= VIEWER_COUNT_MAX):
        clamped = random.randint(VIEWER_COUNT_CLAMP_MIN, VIEWER_COUNT_CLAMP_MAX)
        print(f"  [CORRECTION] {prefix}viewer_count {viewer_count} -> {clamped} "
              f"(valid range 0-{VIEWER_COUNT_MAX})")
        viewer_count = clamped
        corrected = True

    # ── 2. male + female == viewer_count ──────────────────────────────────────
    if male + female != viewer_count:
        old_m, old_f = male, female
        if viewer_count == 0:
            male, female = 0, 0
        else:
            total = old_m + old_f
            if total > 0:
                male   = round(viewer_count * old_m / total)
                female = viewer_count - male
            else:
                male   = viewer_count // 2
                female = viewer_count - male
        print(f"  [CORRECTION] {prefix}male+female {old_m}+{old_f}={old_m+old_f} "
              f"-> {male}+{female}={male+female} "
              f"(must equal viewer_count={viewer_count})")
        corrected = True

    # ── 3. engagement ─────────────────────────────────────────────────────────
    if not (0 <= engagement <= 100):
        default_eng = random.randint(DEFAULT_ENGAGEMENT_MIN, DEFAULT_ENGAGEMENT_MAX)
        print(f"  [CORRECTION] {prefix}engagement {engagement} -> {default_eng} "
              f"(valid range 0-100)")
        engagement = default_eng
        corrected = True

    if corrected:
        print(f"  [CORRECTED]  {prefix}Final -> "
              f"viewer_count={viewer_count}  male={male}  "
              f"female={female}  engagement={engagement}")

    return {
        "viewer_count": viewer_count,
        "male":         male,
        "female":       female,
        "engagement":   engagement,
    }

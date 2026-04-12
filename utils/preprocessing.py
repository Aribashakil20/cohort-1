"""
preprocessing.py — Image Enhancement Before AI Inference
=========================================================

WHY THIS FILE EXISTS
--------------------
AI models like InsightFace were trained mostly on well-lit images
from the internet (celebrities, profile photos, passport photos).
When your room is dark or has dim lighting, the face in the camera
frame is:
  - Too dark (low pixel values)
  - Low contrast (everything looks the same shade of grey)
  - Blurry or noisy

The model sees this and confuses facial structure, making it think
a 20-year-old looks 60, or that a female is male.

The fix: clean up the image BEFORE sending it to InsightFace.
We apply a chain of image processing steps to make the face
look more like what the model was trained on.

WHAT EACH STEP DOES (simple explanation)
-----------------------------------------

Step 1 — Gamma Correction
  "Gamma" controls brightness in a non-linear way.
  gamma < 1.0  →  makes image brighter  (e.g. 0.5 = very bright)
  gamma > 1.0  →  makes image darker
  We use gamma = 0.6 to brighten dim faces.
  Think of it like the brightness slider on your phone.

Step 2 — CLAHE (Contrast Limited Adaptive Histogram Equalization)
  Histogram equalization spreads out pixel values so dark areas
  become brighter and bright areas don't blow out (overexpose).
  CLAHE does this in small tiles across the image, so it
  enhances local contrast (e.g. the area around just your face)
  rather than the whole image at once.
  This is much better than simple brightness increase.

Step 3 — Denoising
  Low light = camera sensor works harder = more digital noise
  (random coloured pixels, grain effect).
  OpenCV's fastNlMeansDenoisingColored() smooths out that grain
  while trying to keep edges sharp.
  We use light denoising (h=5) to avoid making the image too blurry.

Step 4 — Sharpening
  After denoising, the image can look soft.
  We apply a sharpening filter (a convolution kernel that
  emphasises edges) to make facial features crisper.

USAGE
-----
  from preprocessing import enhance_frame
  clean_frame = enhance_frame(raw_frame)
  faces = insightface_app.get(clean_frame)   # now model sees a better image
"""

import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import cv2
import numpy as np


def gamma_correction(img: np.ndarray, gamma: float = 0.6) -> np.ndarray:
    """
    Brighten a dark image using gamma correction.

    How it works:
      Each pixel value (0-255) is normalised to 0.0-1.0,
      raised to the power of (1/gamma), then scaled back.
      gamma=0.6 means: pixel^(1/0.6) = pixel^1.67
      Because pixel values are < 1.0, raising to a power < 1
      makes them larger → brighter.

    Example: pixel value 100 (out of 255) = 0.39
      gamma=0.6  → 0.39^1.67 = 0.56 → 143  (brighter)
      gamma=1.0  → 0.39^1.0  = 0.39 → 100  (unchanged)
      gamma=2.0  → 0.39^0.5  = 0.62 → 160  (also brighter — different curve)
    """
    # Build a lookup table: for each possible pixel value (0-255),
    # precompute the corrected value. Much faster than computing per-pixel.
    # Formula: out = (in/255)^gamma * 255
    # gamma < 1 → exponent < 1 → output > input → brighter
    # gamma > 1 → exponent > 1 → output < input → darker
    table = np.array([
        ((i / 255.0) ** gamma) * 255
        for i in range(256)
    ], dtype=np.uint8)
    return cv2.LUT(img, table)  # apply the table to every pixel


def clahe_enhancement(img: np.ndarray, clip_limit: float = 2.0) -> np.ndarray:
    """
    Improve local contrast using CLAHE.

    Why convert to LAB first?
      LAB is a colour space where:
        L = Lightness (brightness)
        A = green-red colour axis
        B = blue-yellow colour axis
      We only want to enhance brightness (L), not the colours.
      If we applied CLAHE directly on the BGR image, colours
      would shift and look unnatural.
      So: convert BGR → LAB, enhance L only, convert back.

    What is clip_limit?
      CLAHE caps how much contrast can be boosted in any one tile.
      clip_limit=2.0 means: if a tile's histogram has a peak more
      than 2× the average, cut it off and redistribute it.
      This prevents over-enhancing bright spots (e.g. a window
      in the background wouldn't blow out completely).
    """
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l)

    enhanced_lab = cv2.merge([l_enhanced, a, b])
    return cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)


def denoise(img: np.ndarray, strength: int = 5) -> np.ndarray:
    """
    Remove digital noise (grain) from a dim image.

    How it works (Non-Local Means):
      For each pixel, look at similar patches elsewhere in the image.
      Average them together. If a pixel is just noise (random), it
      won't match much → gets smoothed out.
      Real edges and features DO match other parts → preserved.

    strength (h parameter):
      Lower = gentler (keeps more detail but less noise removed)
      Higher = stronger (removes more noise but can blur faces)
      We use 5 — gentle enough to keep facial features.
    """
    return cv2.fastNlMeansDenoisingColored(img, None, strength, strength, 7, 21)


def sharpen(img: np.ndarray) -> np.ndarray:
    """
    Sharpen edges to make facial features crisper after denoising.

    How convolution kernels work:
      A kernel is a small grid of numbers (3×3 here).
      We slide it across every pixel. At each position, multiply
      the pixel and its neighbours by the kernel values, sum them up.
      This new value replaces the centre pixel.

      Our kernel:
        [ 0, -1,  0]
        [-1,  5, -1]
        [ 0, -1,  0]

      The centre pixel gets ×5 (amplified).
      Its direct neighbours get ×-1 (subtracted).
      Effect: if a pixel is brighter than its neighbours,
      it becomes even brighter → edges become sharper.
    """
    kernel = np.array([
        [ 0, -1,  0],
        [-1,  5, -1],
        [ 0, -1,  0]
    ], dtype=np.float32)
    return cv2.filter2D(img, -1, kernel)


def enhance_frame(
    img: np.ndarray,
    do_gamma:   bool  = True,
    gamma_val:  float = 0.6,
    do_clahe:   bool  = True,
    do_denoise: bool  = True,
    do_sharpen: bool  = True,
) -> np.ndarray:
    """
    Full enhancement pipeline — apply all steps in order.

    You can turn individual steps on/off for testing.
    Default settings are tuned for dim indoor lighting.

    Order matters:
      1. Gamma first  → brighten the image so CLAHE has more to work with
      2. CLAHE second → improve local contrast
      3. Denoise third → remove noise introduced/revealed by brightening
      4. Sharpen last  → restore crispness after denoising softened it
    """
    out = img.copy()
    if do_gamma:   out = gamma_correction(out, gamma_val)
    if do_clahe:   out = clahe_enhancement(out)
    if do_denoise: out = denoise(out)
    if do_sharpen: out = sharpen(out)
    return out


def auto_brightness_detect(img: np.ndarray) -> float:
    """
    Measure how dark the image is.
    Returns a value 0.0 (completely black) to 255.0 (completely white).
    We use the mean of the L (Lightness) channel in LAB colour space.

    Why this matters:
      We only want to apply aggressive enhancement when the image
      is actually dark. If it is already bright, gamma correction
      would over-expose it.
      Use this to decide dynamically how much gamma to apply.
    """
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, _, _ = cv2.split(lab)
    return float(np.mean(l))


def adaptive_enhance(img: np.ndarray) -> np.ndarray:
    """
    Smart enhancement: measure brightness first, then choose gamma.

    Brightness thresholds:
      < 80   → very dark  → strong gamma 0.4
      80-120 → dim        → moderate gamma 0.6
      120-160 → slightly dark → gentle gamma 0.8
      > 160  → well lit   → skip gamma, only CLAHE + sharpen

    This prevents over-brightening an already well-lit image
    while giving a big boost to a dark image.
    """
    brightness = auto_brightness_detect(img)

    if brightness < 80:
        gamma = 0.4
    elif brightness < 120:
        gamma = 0.6
    elif brightness < 160:
        gamma = 0.8
    else:
        gamma = 1.0   # no gamma correction needed

    # Always denoise and sharpen; skip gamma if well-lit
    return enhance_frame(
        img,
        do_gamma   = (gamma < 1.0),
        gamma_val  = gamma,
        do_clahe   = True,
        do_denoise = True,
        do_sharpen = True,
    )


# ── Quick visual test ─────────────────────────────────────────────────────────
# Run this file directly to see a side-by-side comparison of
# original vs enhanced on your webcam feed.
if __name__ == "__main__":
    print("Opening webcam for live preprocessing test...")
    print("Press Q to quit, S to save a screenshot comparison.\n")

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open webcam.")
        exit(1)

    save_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.resize(frame, (640, 480))
        enhanced = adaptive_enhance(frame)
        brightness = auto_brightness_detect(frame)

        # Label each panel
        orig_labeled = frame.copy()
        cv2.putText(orig_labeled, f"ORIGINAL  (brightness={brightness:.0f})",
                    (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)

        enh_labeled = enhanced.copy()
        cv2.putText(enh_labeled, "ENHANCED (adaptive gamma+CLAHE+denoise+sharpen)",
                    (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)

        # Stack side by side
        combined = np.hstack([orig_labeled, enh_labeled])
        cv2.imshow("Preprocessing Test — Original vs Enhanced", combined)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('s'):
            fname = f"preprocess_compare_{save_count}.jpg"
            cv2.imwrite(fname, combined)
            print(f"Saved {fname}")
            save_count += 1

    cap.release()
    cv2.destroyAllWindows()
    print("Done.")

"""
emotion_detection.py — Facial emotion recognition using ONNX Runtime
=====================================================================

Model: EmotionFerPlus (ONNX Model Zoo)
  - Trained on FER-2013 dataset (~35,000 labeled facial images)
  - Input:  64×64 grayscale face crop
  - Output: 8 raw scores → softmax → probabilities
  - Labels: neutral, happiness, surprise, sadness, anger, disgust, fear, contempt
  - Size:   ~33 MB — downloaded once on first run

Why this model?
  - Runs entirely on CPU via ONNX Runtime (same runtime already used by InsightFace)
  - ~5–15ms per face crop on CPU — fast enough to run per-face every inference cycle
  - No new heavy dependencies (no TensorFlow, no PyTorch)
  - FER-2013 is the standard benchmark dataset for this task

How it integrates with the pipeline:
  1. After InsightFace detects a face and returns its bbox,
     we crop that region from the camera frame.
  2. analyze_emotion() preprocesses the crop and runs ONNX inference.
  3. The returned emotion + scores are added to the face_results dict.
  4. compute_summary() aggregates emotions across all faces.
  5. The dominant emotion influences ad selection and the engagement quality score.

Privacy note:
  The face crop is processed in-memory and immediately discarded.
  It is never saved to disk, never logged, never transmitted.
"""

import os
import numpy as np

# ── Emotion labels (order matches FerPlus model output) ───────────────────────
EMOTION_LABELS = [
    "neutral", "happiness", "surprise", "sadness",
    "anger",   "disgust",   "fear",     "contempt",
]

# Emotions grouped for dashboard display
POSITIVE_EMOTIONS = {"happiness", "surprise"}
NEGATIVE_EMOTIONS = {"anger", "disgust", "contempt", "fear", "sadness"}

# Quality multiplier — how much each emotion boosts/reduces engagement quality
# happiness * 1.5 means "looking + happy" is 50% more valuable than just "looking"
EMOTION_QUALITY_WEIGHT = {
    "happiness":  1.5,
    "surprise":   1.3,
    "neutral":    1.0,
    "sadness":    0.6,
    "fear":       0.4,
    "anger":      0.3,
    "disgust":    0.2,
    "contempt":   0.15,
}

# ── Model paths and URLs ───────────────────────────────────────────────────────
_THIS_DIR   = os.path.dirname(os.path.abspath(__file__))
_MODEL_PATH = os.path.join(_THIS_DIR, "..", "emotion_model.onnx")
_MODEL_URLS = [
    # Primary: ONNX Model Zoo (GitHub raw)
    "https://github.com/onnx/models/raw/main/validated/vision/body_analysis/"
    "emotion_ferplus/model/emotion-ferplus-8.onnx",
    # Fallback mirror
    "https://github.com/onnx/models/raw/main/vision/body_analysis/"
    "emotion_ferplus/model/emotion-ferplus-8.onnx",
]

_session = None   # ONNX Runtime InferenceSession — loaded once at startup


# ── Model loading ──────────────────────────────────────────────────────────────

def load_emotion_model():
    """
    Load the ONNX emotion model. Downloads it on first run (~33 MB).

    If the download fails or the model cannot be loaded, the function
    returns None and analyze_emotion() will fall back to "neutral" for
    all faces. The rest of the pipeline continues unaffected.
    """
    global _session
    model_path = os.path.abspath(_MODEL_PATH)

    # Download if not already present
    if not os.path.exists(model_path):
        print("[Emotion] Downloading emotion model (~33 MB) — one-time download ...")
        downloaded = False
        for url in _MODEL_URLS:
            try:
                import urllib.request
                urllib.request.urlretrieve(url, model_path)
                downloaded = True
                print("[Emotion] Download complete.")
                break
            except Exception as e:
                print(f"[Emotion] URL failed ({url[:60]}...): {e}")

        if not downloaded:
            print("[Emotion] Could not download emotion model.")
            print("          Manual install: download emotion-ferplus-8.onnx and")
            print(f"          place it at: {model_path}")
            print("          Emotion detection disabled — all faces default to 'neutral'.")
            return None

    # Load ONNX session
    try:
        import onnxruntime as ort
        _session = ort.InferenceSession(
            model_path,
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        print(f"[Emotion] Model ready  ({os.path.basename(model_path)})")
        return _session
    except Exception as e:
        print(f"[Emotion] Could not load model: {e}")
        print("          Emotion detection disabled — all faces default to 'neutral'.")
        return None


# ── Inference ──────────────────────────────────────────────────────────────────

def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x))
    return e / e.sum()


def analyze_emotion(face_crop_bgr: np.ndarray):
    """
    Run emotion inference on a single face crop.

    Parameters
    ----------
    face_crop_bgr : np.ndarray
        BGR face crop from OpenCV (any size — will be resized internally).

    Returns
    -------
    dominant : str
        The highest-probability emotion label (e.g. "happiness").
    scores : dict[str, float]
        Full probability distribution over all 8 emotion labels.
        Example: {"neutral": 0.12, "happiness": 0.65, "surprise": 0.10, ...}
    """
    if _session is None or face_crop_bgr is None or face_crop_bgr.size == 0:
        return "neutral", {l: (1.0 if l == "neutral" else 0.0) for l in EMOTION_LABELS}

    try:
        import cv2

        # ── Preprocess ────────────────────────────────────────────────────────
        # FerPlus expects: 64×64 grayscale, shape (1, 1, 64, 64), float32
        gray    = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2GRAY)
        resized = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA)
        inp     = resized.astype(np.float32).reshape(1, 1, 64, 64)

        # ── Inference ─────────────────────────────────────────────────────────
        input_name = _session.get_inputs()[0].name
        raw_scores = _session.run(None, {input_name: inp})[0][0]  # shape (8,)
        probs      = _softmax(raw_scores)

        scores   = {EMOTION_LABELS[i]: float(probs[i]) for i in range(len(EMOTION_LABELS))}
        dominant = EMOTION_LABELS[int(np.argmax(probs))]
        return dominant, scores

    except Exception as e:
        # Never crash the camera loop due to an emotion inference failure
        print(f"[Emotion] Inference error: {e}")
        return "neutral", {l: (1.0 if l == "neutral" else 0.0) for l in EMOTION_LABELS}


def emotion_quality_weight(emotion: str) -> float:
    """Return the quality multiplier for a given emotion label."""
    return EMOTION_QUALITY_WEIGHT.get(emotion, 1.0)


def is_positive(emotion: str) -> bool:
    return emotion in POSITIVE_EMOTIONS


def is_negative(emotion: str) -> bool:
    return emotion in NEGATIVE_EMOTIONS

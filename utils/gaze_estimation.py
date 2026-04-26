"""
gaze_estimation.py — Head Pose-Based Gaze Detection
=====================================================

What this module does:
    Determines whether a person is looking toward the camera / display
    by estimating their head pose from InsightFace's 3D facial landmarks.

Why head pose instead of det_score?
    det_score (detection confidence) only tells you "is there a face here?"
    A high det_score does NOT mean the person is looking at the screen —
    someone standing sideways can still have a high det_score.

    Head pose gives us actual yaw (left/right turn) and pitch (up/down tilt).
    If both are small → the face is pointing toward the camera → person is
    looking at the display.

How it works (solvePnP):
    1. We have a standard 3D face model — 6 key points in real-world mm
       (nose tip, chin, eye corners, mouth corners).
    2. InsightFace gives us where those same 6 points appear in the 2D image.
    3. cv2.solvePnP solves the geometry: "what rotation + translation maps
       the 3D model onto the observed 2D image points?"
    4. We extract Euler angles (yaw, pitch, roll) from that rotation matrix.

Thresholds:
    |yaw|   < 30° → not turned more than 30° left or right
    |pitch| < 25° → not looking more than 25° up or down
    Both must be within threshold → is_looking = True

Fallback:
    If InsightFace did not return 3D landmarks (shouldn't happen with buffalo_l,
    but handled gracefully), we fall back to the old det_score proxy.
"""

import numpy as np
import cv2

# ── Standard 3D face model ────────────────────────────────────────────────────
# These are canonical face point positions in millimetres, origin at nose tip.
# Taken from the widely-used 6-point head pose model (Garg et al.).
# Indices refer to the 68-point facial landmark numbering used by InsightFace's
# 1k3d68.onnx model (part of the buffalo_l pack).
_MODEL_3D = np.array([
    (  0.0,    0.0,    0.0),   # index 30 — nose tip       (origin)
    (  0.0, -330.0,  -65.0),   # index  8 — chin
    (-225.0,  170.0, -135.0),  # index 36 — left  eye, outer corner
    ( 225.0,  170.0, -135.0),  # index 45 — right eye, outer corner
    (-150.0, -150.0, -125.0),  # index 48 — left  mouth corner
    ( 150.0, -150.0, -125.0),  # index 54 — right mouth corner
], dtype=np.float64)

# The 68-landmark indices that match the 6 model points above
_LM_IDX = [30, 8, 36, 45, 48, 54]


def estimate_head_pose(landmark_3d_68, frame_shape):
    """
    Estimate head pose from InsightFace 3D landmarks.

    Parameters
    ----------
    landmark_3d_68 : np.ndarray, shape (68, 3)
        Output of InsightFace buffalo_l 1k3d68 model.
        x, y = image pixel coordinates; z = relative depth (used by model but
        not by us here — we only use the x,y image positions for solvePnP).
    frame_shape : tuple  (height, width, channels)

    Returns
    -------
    (yaw, pitch, roll) in degrees, or (None, None, None) if estimation failed.

    Sign convention:
        yaw   > 0 → face turned to the right (from viewer's perspective)
        yaw   < 0 → face turned to the left
        pitch > 0 → face tilted upward
        pitch < 0 → face tilted downward
    """
    if landmark_3d_68 is None or len(landmark_3d_68) < 68:
        return None, None, None

    h, w = frame_shape[:2]

    # Extract the 6 image points (x, y) — we ignore the z component here
    # because solvePnP takes 2D image observations vs 3D model points
    image_points = np.array(
        [landmark_3d_68[i][:2] for i in _LM_IDX],
        dtype=np.float64
    )

    # Approximate camera intrinsic matrix.
    # We don't have a calibrated camera, so we use standard approximations:
    #   focal length ≈ frame width (in pixels)
    #   principal point ≈ frame centre
    # This is accurate enough for gaze detection purposes.
    focal = float(w)
    camera_matrix = np.array([
        [focal,   0.0, w / 2.0],
        [  0.0, focal, h / 2.0],
        [  0.0,   0.0,     1.0],
    ], dtype=np.float64)
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)  # assume no lens distortion

    ok, rvec, _ = cv2.solvePnP(
        _MODEL_3D, image_points,
        camera_matrix, dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE,
    )
    if not ok:
        return None, None, None

    # Convert rotation vector → rotation matrix
    R, _ = cv2.Rodrigues(rvec)

    # Extract Euler angles from rotation matrix (XYZ decomposition)
    # sy = sqrt(R[0,0]^2 + R[1,0]^2) — measures how non-singular the matrix is
    sy = np.sqrt(R[0, 0] ** 2 + R[1, 0] ** 2)
    if sy > 1e-6:
        pitch = np.degrees(np.arctan2( R[2, 1],  R[2, 2]))
        yaw   = np.degrees(np.arctan2(-R[2, 0],  sy))
        roll  = np.degrees(np.arctan2( R[1, 0],  R[0, 0]))
    else:
        # Gimbal lock — two rotation axes align, degenerate case
        pitch = np.degrees(np.arctan2(-R[1, 2],  R[1, 1]))
        yaw   = np.degrees(np.arctan2(-R[2, 0],  sy))
        roll  = 0.0

    return round(yaw, 1), round(pitch, 1), round(roll, 1)


def is_looking_at_screen(
    face,
    frame_shape,
    yaw_thresh:   float = 30.0,
    pitch_thresh: float = 25.0,
    det_fallback: float = 0.65,
):
    """
    Decide whether a detected face is looking toward the camera / display.

    Decision hierarchy:
      1. Head pose from 3D landmarks (accurate — uses actual geometry)
      2. Detection confidence fallback (coarse — used only if landmarks missing)

    Parameters
    ----------
    face         : InsightFace face object
    frame_shape  : (height, width, channels) of the source frame
    yaw_thresh   : max allowed |yaw| in degrees (default 30°)
    pitch_thresh : max allowed |pitch| in degrees (default 25°)
    det_fallback : det_score threshold used only if landmarks unavailable

    Returns
    -------
    (looking: bool, yaw: float | None, pitch: float | None)
    """
    lm = getattr(face, "landmark_3d_68", None)
    yaw, pitch, _ = estimate_head_pose(lm, frame_shape)

    if yaw is not None and pitch is not None:
        looking = abs(yaw) < yaw_thresh and abs(pitch) < pitch_thresh
        return looking, yaw, pitch

    # Fallback — old proxy method
    looking = float(face.det_score) >= det_fallback
    return looking, None, None

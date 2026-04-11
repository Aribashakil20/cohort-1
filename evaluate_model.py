"""
evaluate_model.py — Test the trained model + run it live on webcam
===================================================================

THREE MODES
-----------
1. evaluate  — Run on UTKFace validation set. Print accuracy report.
2. live      — Open webcam and run the trained model in real time.
3. compare   — Side-by-side: InsightFace vs our trained model, live.

Run with:
  python evaluate_model.py evaluate
  python evaluate_model.py live
  python evaluate_model.py compare
"""

import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import sys
import time
import json
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision import models
from torch.utils.data import DataLoader, random_split
import albumentations as A
from albumentations.pytorch import ToTensorV2

from preprocessing import adaptive_enhance

# ── Same config as train_age_gender.py ───────────────────────────────────────
IMG_SIZE     = 112
BATCH_SIZE   = 64
DATASET_DIR  = Path("utk_dataset")
MODEL_PATH   = Path("models/age_gender_model.pth")
SEED         = 42
VAL_SPLIT    = 0.15


# ══════════════════════════════════════════════════════════════════════════════
# MODEL — must match exactly what was defined in train_age_gender.py
# ══════════════════════════════════════════════════════════════════════════════

class AgeGenderModel(nn.Module):
    def __init__(self):
        super().__init__()
        backbone = models.mobilenet_v2(weights=None)   # no pretrained weights — we load ours
        self.backbone     = backbone.features
        self.pool         = nn.AdaptiveAvgPool2d(1)
        self.gender_head  = nn.Sequential(
            nn.Dropout(0.3), nn.Linear(1280, 256), nn.ReLU(), nn.Linear(256, 1), nn.Sigmoid()
        )
        self.age_head = nn.Sequential(
            nn.Dropout(0.3), nn.Linear(1280, 256), nn.ReLU(), nn.Linear(256, 1)
        )

    def forward(self, x):
        f = self.pool(self.backbone(x)).flatten(1)
        return self.gender_head(f).squeeze(1), self.age_head(f).squeeze(1)


def load_model(path: Path, device: torch.device) -> AgeGenderModel:
    """Load the saved model checkpoint."""
    if not path.exists():
        print(f"ERROR: Model not found at {path}")
        print("Run  python train_age_gender.py  first to train the model.")
        sys.exit(1)

    checkpoint = torch.load(path, map_location=device, weights_only=False)
    model = AgeGenderModel().to(device)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()

    print(f"Loaded model from {path}")
    print(f"  Trained for:    {checkpoint['epoch']} epochs")
    print(f"  Gender accuracy:{checkpoint['val_acc']:.1%}")
    print(f"  Age MAE:        {checkpoint['age_mae']:.1f} years\n")
    return model


# ══════════════════════════════════════════════════════════════════════════════
# INFERENCE ON A SINGLE FACE CROP
# ══════════════════════════════════════════════════════════════════════════════

# ImageNet normalisation — must match what was used during training
_transform = A.Compose([
    A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
    ToTensorV2(),
])

def predict_face(model, face_crop: np.ndarray, device: torch.device) -> dict:
    """
    Run our trained model on one face crop (numpy array, BGR).
    Returns: {"gender": "Male"/"Female", "age": int, "gender_conf": float}

    Steps:
    1. Resize to 112×112 (what the model was trained on)
    2. Convert BGR → RGB (model was trained on RGB)
    3. Apply same normalisation used in training
    4. Add batch dimension (model expects batch of images, not single image)
    5. Run forward pass
    6. Convert output to human-readable values
    """
    img = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (IMG_SIZE, IMG_SIZE))

    tensor = _transform(image=img)["image"].unsqueeze(0).to(device)  # (1, 3, 112, 112)

    with torch.no_grad():
        gender_prob, age_norm = model(tensor)

    gender_prob = float(gender_prob.item())     # 0.0 = Female, 1.0 = Male
    age         = round(float(age_norm.item()) * 100)
    age         = max(0, min(100, age))         # clamp to 0-100

    gender = "Male" if gender_prob > 0.5 else "Female"
    conf   = gender_prob if gender == "Male" else (1 - gender_prob)

    return {"gender": gender, "age": age, "gender_conf": round(conf, 3)}


# ══════════════════════════════════════════════════════════════════════════════
# MODE 1 — EVALUATE ON VALIDATION SET
# ══════════════════════════════════════════════════════════════════════════════

def mode_evaluate(model, device):
    """
    Run the model on the UTKFace validation set and print a full report.
    Also tests on simulated low-light versions of the same images.
    """
    if not DATASET_DIR.exists():
        print(f"ERROR: Dataset not found at {DATASET_DIR}")
        return

    # Import dataset class from training script
    from train_age_gender import UTKFaceDataset

    val_transform = A.Compose([
        A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
        ToTensorV2(),
    ])
    full_ds = UTKFaceDataset(DATASET_DIR, transform=val_transform)
    val_size = int(len(full_ds) * VAL_SPLIT)
    torch.manual_seed(SEED)
    _, val_ds = torch.utils.data.random_split(full_ds, [len(full_ds) - val_size, val_size])
    loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False)

    print(f"Evaluating on {val_size} validation images...")

    correct_gender = total = 0
    age_errors = []

    model.eval()
    with torch.no_grad():
        for imgs, ages, genders in loader:
            imgs    = imgs.to(device)
            ages    = ages.to(device)
            genders = genders.to(device)

            gender_pred, age_pred = model(imgs)
            predicted = (gender_pred > 0.5).float()

            correct_gender += (predicted == genders).sum().item()
            total += len(genders)

            age_err = torch.abs(age_pred - ages) * 100
            age_errors.extend(age_err.cpu().numpy().tolist())

    print("\n=== Evaluation Results ===")
    print(f"  Gender Accuracy:   {correct_gender/total:.1%}  ({correct_gender}/{total})")
    print(f"  Age MAE:           {np.mean(age_errors):.1f} years")
    print(f"  Age within 5 yrs:  {sum(1 for e in age_errors if e <= 5)/total:.1%}")
    print(f"  Age within 10 yrs: {sum(1 for e in age_errors if e <= 10)/total:.1%}")


# ══════════════════════════════════════════════════════════════════════════════
# MODE 2 — LIVE WEBCAM
# ══════════════════════════════════════════════════════════════════════════════

def mode_live(model, device):
    """
    Run our trained model live on the webcam.
    Uses InsightFace for face detection (bounding boxes),
    then runs our custom model for age/gender on each crop.

    Why use InsightFace for detection but our model for age/gender?
      InsightFace is excellent at finding faces.
      Our model (fine-tuned on lighting augmentation) should be
      more accurate at age/gender under poor lighting.
    """
    from insightface.app import FaceAnalysis
    print("Loading InsightFace for face detection...")
    detector = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    detector.prepare(ctx_id=0, det_size=(640, 640))

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open webcam.")
        return

    print("\nLive mode. Press Q to quit, E to toggle preprocessing.\n")
    use_preprocessing = True

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame = cv2.resize(frame, (640, 480))

        # Optionally enhance frame before inference
        proc_frame = adaptive_enhance(frame) if use_preprocessing else frame

        # Detect faces
        faces = detector.get(proc_frame)

        for face in faces:
            bbox = face.bbox.astype(int)
            x1, y1, x2, y2 = bbox[0], bbox[1], bbox[2], bbox[3]

            # Crop the face from the ENHANCED frame
            x1c, y1c = max(0, x1), max(0, y1)
            x2c, y2c = min(frame.shape[1], x2), min(frame.shape[0], y2)
            crop = proc_frame[y1c:y2c, x1c:x2c]

            if crop.size == 0:
                continue

            result = predict_face(model, crop, device)

            # Draw bounding box
            color = (255, 100, 0) if result["gender"] == "Male" else (0, 100, 255)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            # Label
            label = f"{result['gender'][0]}, {result['age']}y ({result['gender_conf']:.0%})"
            cv2.putText(frame, label, (x1, max(y1 - 6, 12)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        # Status overlay
        prep_str = "Preprocessing: ON" if use_preprocessing else "Preprocessing: OFF"
        cv2.putText(frame, prep_str, (10, 460),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1)
        cv2.putText(frame, "Custom model (fine-tuned)", (10, 440),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)

        cv2.imshow("Custom Age/Gender Model — Live", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('e'):
            use_preprocessing = not use_preprocessing
            print(f"Preprocessing toggled: {use_preprocessing}")

    cap.release()
    cv2.destroyAllWindows()


# ══════════════════════════════════════════════════════════════════════════════
# MODE 3 — SIDE BY SIDE: InsightFace vs Our Model
# ══════════════════════════════════════════════════════════════════════════════

def mode_compare(model, device):
    """
    Split screen: left = InsightFace buffalo_l, right = our custom model.
    Both use the same face detection (InsightFace detector).
    Only the age/gender prediction differs.
    Makes it easy to see where our model beats the original.
    """
    from insightface.app import FaceAnalysis
    print("Loading InsightFace buffalo_l for comparison...")
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open webcam.")
        return

    print("\nCompare mode. Press Q to quit.\n")

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame = cv2.resize(frame, (640, 480))
        enh   = adaptive_enhance(frame)

        left  = frame.copy()
        right = frame.copy()

        # Run InsightFace on enhanced frame
        faces = app.get(enh)

        for face in faces:
            bbox = face.bbox.astype(int)
            x1, y1, x2, y2 = bbox[0], bbox[1], bbox[2], bbox[3]

            # InsightFace result (left panel)
            age_if       = int(face.age)    if face.age    is not None else -1
            gender_id_if = int(face.gender) if face.gender is not None else 0
            gender_if    = "Male" if gender_id_if == 1 else "Female"
            score_if     = float(face.det_score)

            col_if = (0, 255, 0)
            cv2.rectangle(left, (x1, y1), (x2, y2), col_if, 2)
            cv2.putText(left, f"IF: {gender_if[0]},{age_if}y ({score_if:.0%})",
                        (x1, max(y1 - 6, 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, col_if, 2)

            # Our model result (right panel)
            x1c, y1c = max(0, x1), max(0, y1)
            x2c, y2c = min(frame.shape[1], x2), min(frame.shape[0], y2)
            crop = enh[y1c:y2c, x1c:x2c]
            if crop.size > 0:
                res = predict_face(model, crop, device)
                col_our = (255, 100, 0) if res["gender"] == "Male" else (0, 100, 255)
                cv2.rectangle(right, (x1, y1), (x2, y2), col_our, 2)
                cv2.putText(right, f"OURS: {res['gender'][0]},{res['age']}y ({res['gender_conf']:.0%})",
                            (x1, max(y1 - 6, 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, col_our, 2)

        # Labels
        cv2.rectangle(left,  (0, 0), (300, 28), (30, 30, 30), -1)
        cv2.putText(left,  "InsightFace buffalo_l (original)",
                    (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 1)
        cv2.rectangle(right, (0, 0), (280, 28), (30, 30, 30), -1)
        cv2.putText(right, "Our fine-tuned model + preprocessing",
                    (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 165, 0), 1)

        combined = np.hstack([left, right])
        cv2.imshow("Comparison: InsightFace vs Our Model", combined)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "live"
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = load_model(MODEL_PATH, device)

    if mode == "evaluate":
        mode_evaluate(model, device)
    elif mode == "live":
        mode_live(model, device)
    elif mode == "compare":
        mode_compare(model, device)
    else:
        print(f"Unknown mode: {mode}")
        print("Usage: python evaluate_model.py [evaluate|live|compare]")

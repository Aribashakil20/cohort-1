"""
train_age_gender.py — Fine-tune a Custom Age + Gender Model
============================================================

WHY WE TRAIN OUR OWN MODEL
---------------------------
InsightFace buffalo_l was trained on internet photos — well-lit,
frontal, high resolution. It was NOT trained on:
  - Dim indoor lighting
  - Webcam-quality images (grainy, compressed)
  - Your specific camera angle

We fix this by fine-tuning. Fine-tuning means:
  1. Take a model that already knows about faces (pretrained on millions)
  2. Give it MORE examples — this time, with varied/poor lighting
  3. Let it adjust its weights slightly to handle these cases better

It is much faster and cheaper than training from scratch.
You don't need a GPU — this runs on CPU (slowly but correctly).

ARCHITECTURE: MobileNetV2 + Two Output Heads
--------------------------------------------
MobileNetV2 is a lightweight neural network backbone.
"Backbone" means: the part that looks at an image and turns it
into a list of numbers (feature vector) that describes what it sees.

We add two "heads" on top:
  Head 1 (gender) — binary classification: Male or Female
    → sigmoid activation → outputs a number between 0 and 1
    → > 0.5 = Male,  < 0.5 = Female

  Head 2 (age) — regression: predict a number (age in years)
    → no activation → outputs any number (we scale to 0-100)

Why MobileNetV2?
  It is specifically designed to run fast on CPUs and mobile devices.
  Less accurate than ResNet50 or ViT, but much faster for our use case.
  Pretrained on ImageNet (millions of real images) — a great starting point.

DATASET: UTKFace
----------------
UTKFace is a publicly available dataset of 20,000+ face photos with:
  - Age labels: 0 to 116 years
  - Gender labels: Male (0) or Female (1)
  - Race labels (we won't use these)

Download link: https://susanqq.github.io/UTKFace/
Filename format: [age]_[gender]_[race]_[timestamp].jpg
Example: 25_0_2_20170117143922082.jpg = age 25, male, race 2

WHAT AUGMENTATION MEANS
------------------------
Augmentation = artificially creating more training examples by
randomly modifying your existing images. This teaches the model
"these variations are still the same person".

Our augmentations for the lighting problem:
  - Random brightness shift    → simulates dim vs bright rooms
  - Random contrast change     → simulates camera auto-exposure
  - Random shadow overlay      → simulates one side lit, one dark
  - Random JPEG compression    → simulates webcam quality loss
  - Horizontal flip            → mirrors the face (same person)
  - Small rotation             → head tilt

Without augmentation, the model would only learn well-lit faces
and fail on dim ones — the exact problem we are trying to fix.

HOW TO USE THIS SCRIPT
-----------------------
Step 1: Download UTKFace dataset
  - Go to: https://susanqq.github.io/UTKFace/
  - Download "part1.tar.gz" (about 1GB)
  - Extract into: SmartAudienceAnalysis/utk_dataset/

Step 2: Run training
  python train_age_gender.py

Step 3: The trained model saves to:
  models/age_gender_model.pth

Step 4: Run evaluation
  python evaluate_model.py

TRAINING SETTINGS (easy to change)
------------------------------------
  EPOCHS      = 15     → how many full passes through the dataset
  BATCH_SIZE  = 32     → how many images per training step
  LR          = 0.001  → learning rate (how big each adjustment step is)
  FREEZE_UP_TO = 14    → how many backbone layers to freeze (not retrain)

Higher epochs = more accurate but slower.
Lower LR = more careful but slower.
"""

import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import time
import json
import re
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader, random_split
from torchvision import transforms, models
import albumentations as A
from albumentations.pytorch import ToTensorV2


# ══════════════════════════════════════════════════════════════════════════════
# CONFIG — change these values to tune training
# ══════════════════════════════════════════════════════════════════════════════

DATASET_DIR  = Path("utk_dataset")   # folder where UTKFace images live
MODEL_DIR    = Path("models")
MODEL_PATH   = MODEL_DIR / "age_gender_model.pth"
LOG_PATH     = MODEL_DIR / "training_log.json"

IMG_SIZE     = 112     # resize all face images to 112×112 pixels
EPOCHS       = 15      # number of training passes
BATCH_SIZE   = 32      # images per batch
LR           = 1e-3    # learning rate
WEIGHT_DECAY = 1e-4    # regularisation (prevents overfitting)
FREEZE_UP_TO = 14      # freeze this many layers of MobileNetV2 backbone
GENDER_WEIGHT = 2.0    # how much to weight gender loss vs age loss
                        # higher = model prioritises gender accuracy more
VAL_SPLIT    = 0.15    # 15% of data used for validation (not training)
SEED         = 42


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — DATASET
# ══════════════════════════════════════════════════════════════════════════════

class UTKFaceDataset(Dataset):
    """
    PyTorch Dataset for UTKFace.

    A Dataset in PyTorch is a class with two required methods:
      __len__  → returns total number of samples
      __getitem__(idx) → returns one sample (image + label) by index

    PyTorch's DataLoader calls these automatically when training.

    UTKFace filename format: age_gender_race_timestamp.jpg
      age     = integer (years)
      gender  = 0 (male) or 1 (female)
      race    = 0-4 (we ignore this)
    """

    def __init__(self, root: Path, transform=None):
        self.root = root
        self.transform = transform
        self.samples = []  # list of (filepath, age, gender) tuples

        print(f"[Dataset] Scanning {root} ...")

        for fpath in root.glob("*.jpg"):
            parts = fpath.stem.split("_")
            if len(parts) < 2:
                continue
            try:
                age    = int(parts[0])
                gender = int(parts[1])   # 0=male, 1=female
            except ValueError:
                continue

            # Skip unrealistic ages
            if age < 0 or age > 110:
                continue
            if gender not in (0, 1):
                continue

            self.samples.append((fpath, age, gender))

        print(f"[Dataset] Found {len(self.samples)} valid images.\n")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        fpath, age, gender = self.samples[idx]

        # Read image in BGR (OpenCV default), convert to RGB for the model
        img = cv2.imread(str(fpath))
        if img is None:
            # Return a black image if the file is corrupted
            img = np.zeros((IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        else:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img = cv2.resize(img, (IMG_SIZE, IMG_SIZE))

        if self.transform:
            augmented = self.transform(image=img)
            img = augmented["image"]   # albumentations returns dict

        # Normalise age to 0-1 range for more stable training
        # The model outputs 0-1, we multiply back by 100 at inference time
        age_norm = age / 100.0

        return img, torch.tensor(age_norm, dtype=torch.float32), torch.tensor(gender, dtype=torch.float32)


def build_transforms(is_train: bool):
    """
    Build the augmentation pipeline.

    Training:   random augmentations to teach the model robustness
    Validation: only normalise — we want clean, unmodified test images

    Why albumentations instead of torchvision transforms?
      albumentations is faster and has more augmentation options,
      especially for image quality degradation (brightness, noise, blur).
    """
    if is_train:
        return A.Compose([
            A.HorizontalFlip(p=0.5),
            # ── Lighting augmentations ──────────────────────────────────
            # These are the critical ones for our problem.
            # RandomBrightnessContrast simulates dim/bright rooms.
            A.RandomBrightnessContrast(
                brightness_limit=(-0.5, 0.2),  # allow very dark but not very bright
                contrast_limit=(-0.3, 0.3),
                p=0.9,   # 90% chance — applied most of the time
            ),
            # RandomShadow adds a shadow across part of the image.
            # This simulates one side of the face being lit and the other dark.
            A.RandomShadow(
                shadow_roi=(0, 0, 1, 1),   # shadow can appear anywhere
                num_shadows_lower=1,
                num_shadows_upper=2,
                shadow_dimension=5,
                p=0.4,
            ),
            # RandomGamma: another way to simulate dim lighting
            A.RandomGamma(gamma_limit=(40, 180), p=0.5),
            # Blur: webcam images are often slightly blurry
            A.OneOf([
                A.GaussianBlur(blur_limit=(3, 5), p=1.0),
                A.MotionBlur(blur_limit=5, p=1.0),
            ], p=0.3),
            # Noise: low-light cameras produce grainy images
            A.GaussNoise(var_limit=(10, 50), p=0.4),
            # JPEG compression artifacts: webcams compress heavily
            A.ImageCompression(quality_lower=40, quality_upper=95, p=0.4),
            # Small rotation: head tilt
            A.Rotate(limit=15, p=0.5),
            # ── Normalisation (always applied) ───────────────────────────
            # Subtract mean and divide by std deviation.
            # These are ImageNet statistics — used because MobileNetV2
            # was pretrained on ImageNet. Using the same stats means
            # the pretrained weights work correctly.
            A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
            ToTensorV2(),  # converts numpy array → PyTorch tensor
        ])
    else:
        return A.Compose([
            A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
            ToTensorV2(),
        ])


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — MODEL ARCHITECTURE
# ══════════════════════════════════════════════════════════════════════════════

class AgeGenderModel(nn.Module):
    """
    MobileNetV2 backbone + two output heads.

    nn.Module is the base class for all PyTorch models.
    Every model must define:
      __init__  → build the layers
      forward   → define how data flows through the layers

    WHAT IS A NEURAL NETWORK LAYER?
      Each layer takes a vector of numbers in, transforms it,
      and outputs a new vector. Chained together, they learn
      increasingly abstract features:
        Early layers  → detect edges, colours
        Middle layers → detect shapes, textures
        Late layers   → detect "this is an eye", "this is a jaw"
        Output heads  → "this face is 25 years old, female"

    WHAT IS FREEZING?
      The pretrained backbone already learned useful features.
      We "freeze" (stop updating) most of its layers so they
      don't get ruined by our small dataset.
      We only train the last few backbone layers + both heads.
      This is called "partial fine-tuning" and is standard practice.
    """

    def __init__(self, freeze_up_to: int = 14):
        super().__init__()

        # Load MobileNetV2 pretrained on ImageNet
        # pretrained=True downloads weights automatically (~14MB)
        backbone = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT)

        # MobileNetV2 has 19 "features" (convolutional blocks).
        # We freeze the first `freeze_up_to` blocks — they already
        # know about edges, textures, etc. from ImageNet training.
        for i, layer in enumerate(backbone.features):
            if i < freeze_up_to:
                for param in layer.parameters():
                    param.requires_grad = False   # frozen — won't update

        # Remove the original MobileNetV2 classifier (it was designed
        # for 1000 ImageNet classes — we don't need that).
        self.backbone = backbone.features

        # Global Average Pooling: takes the (7×7×1280) feature map
        # from the backbone and averages it to a single (1280,) vector.
        # This compresses spatial info down to just "what features are present".
        self.pool = nn.AdaptiveAvgPool2d(1)

        # Gender head: 1280 → 256 → 1
        # Sigmoid activation squashes output to 0-1 (Male=1, Female=0)
        self.gender_head = nn.Sequential(
            nn.Dropout(0.3),           # randomly zero out 30% of neurons during training
            nn.Linear(1280, 256),      # fully connected layer
            nn.ReLU(),                 # activation: max(0, x) — adds non-linearity
            nn.Linear(256, 1),
            nn.Sigmoid(),              # squash to [0, 1]
        )

        # Age head: 1280 → 256 → 1
        # No final activation — raw number (we'll interpret as age/100)
        self.age_head = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(1280, 256),
            nn.ReLU(),
            nn.Linear(256, 1),
        )

    def forward(self, x):
        """
        x shape: (batch_size, 3, 112, 112)
        i.e. a batch of 32 RGB images, each 112×112 pixels.
        """
        features = self.backbone(x)         # → (batch, 1280, 4, 4)
        features = self.pool(features)       # → (batch, 1280, 1, 1)
        features = features.flatten(1)       # → (batch, 1280)

        gender = self.gender_head(features)  # → (batch, 1)
        age    = self.age_head(features)     # → (batch, 1)

        return gender.squeeze(1), age.squeeze(1)   # → (batch,), (batch,)


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — TRAINING LOOP
# ══════════════════════════════════════════════════════════════════════════════

def train_epoch(model, loader, optimizer, gender_criterion, age_criterion, device):
    """
    One full pass through the training data.
    Returns average total loss, gender loss, age loss.

    What is a loss?
      It is a number measuring how wrong the model's predictions are.
      Higher loss = more wrong. We want to minimise it.

      Gender loss: Binary Cross-Entropy — standard for yes/no predictions.
        If model predicts 0.9 (Male) and truth is Female (0), BCEloss is high.

      Age loss: Mean Absolute Error — average difference in predicted vs real age.
        If model says 28 and real age is 20, MAE = 8 years.

    What is an optimizer?
      It adjusts the model weights after each batch to reduce the loss.
      We use AdamW — a popular adaptive optimizer that adjusts step sizes
      per-parameter automatically.

    What is backpropagation?
      1. Forward pass: run the image through the model → get prediction
      2. Compute loss: how wrong was the prediction?
      3. Backward pass: compute how much each weight contributed to the error
      4. Update: nudge each weight in the direction that reduces the error
    """
    model.train()
    total_loss = gender_loss_sum = age_loss_sum = 0.0
    correct_gender = total = 0

    for imgs, ages, genders in loader:
        imgs    = imgs.to(device)
        ages    = ages.to(device)
        genders = genders.to(device)

        optimizer.zero_grad()   # clear gradients from previous batch

        gender_pred, age_pred = model(imgs)

        # Compute individual losses
        g_loss = gender_criterion(gender_pred, genders) * GENDER_WEIGHT
        a_loss = age_criterion(age_pred, ages)
        loss   = g_loss + a_loss

        loss.backward()         # compute gradients (backpropagation)
        optimizer.step()        # update weights

        total_loss      += loss.item()
        gender_loss_sum += g_loss.item()
        age_loss_sum    += a_loss.item()

        # Accuracy: predicted gender matches truth?
        predicted = (gender_pred > 0.5).float()
        correct_gender += (predicted == genders).sum().item()
        total += len(genders)

    n = len(loader)
    return (
        total_loss / n,
        gender_loss_sum / n,
        age_loss_sum / n,
        correct_gender / total,   # gender accuracy
    )


def validate(model, loader, gender_criterion, age_criterion, device):
    """
    Evaluate model on validation set (data it has never trained on).
    We set model.eval() which disables dropout and batch normalisation
    noise — we want deterministic predictions at evaluation time.
    torch.no_grad() skips gradient computation (faster, less memory).
    """
    model.eval()
    total_loss = gender_loss_sum = age_loss_sum = 0.0
    correct_gender = total = 0
    age_errors = []

    with torch.no_grad():
        for imgs, ages, genders in loader:
            imgs    = imgs.to(device)
            ages    = ages.to(device)
            genders = genders.to(device)

            gender_pred, age_pred = model(imgs)

            g_loss = gender_criterion(gender_pred, genders) * GENDER_WEIGHT
            a_loss = age_criterion(age_pred, ages)

            total_loss      += (g_loss + a_loss).item()
            gender_loss_sum += g_loss.item()
            age_loss_sum    += a_loss.item()

            predicted = (gender_pred > 0.5).float()
            correct_gender += (predicted == genders).sum().item()
            total += len(genders)

            # Collect per-sample age errors (convert back from normalised)
            err = torch.abs(age_pred - ages) * 100   # back to years
            age_errors.extend(err.cpu().numpy().tolist())

    n = len(loader)
    return (
        total_loss / n,
        gender_loss_sum / n,
        age_loss_sum / n,
        correct_gender / total,
        float(np.mean(age_errors)),    # mean absolute age error in years
    )


def train():
    """Main training function — ties everything together."""

    MODEL_DIR.mkdir(exist_ok=True)

    # ── Check dataset ───────────────────────────────────────────────────────
    if not DATASET_DIR.exists() or not any(DATASET_DIR.glob("*.jpg")):
        print(f"""
ERROR: Dataset not found at '{DATASET_DIR}'.

To train the model, you need to download the UTKFace dataset:

  Step 1: Go to  https://susanqq.github.io/UTKFace/
  Step 2: Download 'part1.tar.gz'  (~1 GB)
  Step 3: Extract ALL .jpg files into:
            {DATASET_DIR.resolve()}

  After extracting you should see files like:
    {DATASET_DIR}/25_0_2_20170117143922082.jpg
    {DATASET_DIR}/34_1_0_20161220234519701.jpg
    (filename format: age_gender_race_timestamp.jpg)

Then re-run:  python train_age_gender.py
""")
        return

    # ── Device ──────────────────────────────────────────────────────────────
    # On your laptop: CPU (no GPU). Training will be slow but correct.
    # If you had an NVIDIA GPU with CUDA installed, this would auto-use it.
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[Training] Device: {device}")
    if device.type == "cpu":
        print("[Training] NOTE: Training on CPU. This will take ~30-60 min for 15 epochs.")
        print("[Training] Reduce EPOCHS or BATCH_SIZE at the top of this file to speed up.\n")

    # ── Datasets ────────────────────────────────────────────────────────────
    full_dataset = UTKFaceDataset(DATASET_DIR, transform=build_transforms(is_train=True))

    val_size   = int(len(full_dataset) * VAL_SPLIT)
    train_size = len(full_dataset) - val_size

    torch.manual_seed(SEED)
    train_ds, val_ds = random_split(full_dataset, [train_size, val_size])

    # Override val transform — no augmentation on validation
    val_ds.dataset = UTKFaceDataset(DATASET_DIR, transform=build_transforms(is_train=False))

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,  num_workers=0)
    val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    print(f"[Training] Train: {train_size} images  |  Val: {val_size} images\n")

    # ── Model + loss functions + optimizer ──────────────────────────────────
    model = AgeGenderModel(freeze_up_to=FREEZE_UP_TO).to(device)

    gender_criterion = nn.BCELoss()     # Binary Cross-Entropy for gender
    age_criterion    = nn.L1Loss()      # Mean Absolute Error for age

    # AdamW optimizer — only update parameters with requires_grad=True
    # (frozen layers won't be updated because their requires_grad=False)
    optimizer = torch.optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=LR,
        weight_decay=WEIGHT_DECAY,
    )

    # Learning rate scheduler: reduce LR by 50% if val loss stops improving
    # "Patience 3" = wait 3 epochs before reducing
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=3, verbose=True
    )

    # ── Training loop ───────────────────────────────────────────────────────
    best_val_loss = float("inf")
    log = []

    print(f"{'Epoch':>5} | {'Train Loss':>10} | {'Val Loss':>8} | {'Gender Acc':>10} | {'Age MAE':>8} | {'LR':>10}")
    print("-" * 65)

    for epoch in range(1, EPOCHS + 1):
        t_start = time.time()

        tr_loss, tr_g, tr_a, tr_acc = train_epoch(
            model, train_loader, optimizer, gender_criterion, age_criterion, device
        )
        val_loss, val_g, val_a, val_acc, age_mae = validate(
            model, val_loader, gender_criterion, age_criterion, device
        )

        scheduler.step(val_loss)

        elapsed = time.time() - t_start
        current_lr = optimizer.param_groups[0]["lr"]

        print(f"{epoch:>5} | {tr_loss:>10.4f} | {val_loss:>8.4f} | "
              f"{val_acc:>9.1%}  | {age_mae:>6.1f}y  | {current_lr:.2e}")

        log.append({
            "epoch": epoch, "train_loss": tr_loss, "val_loss": val_loss,
            "val_gender_acc": val_acc, "val_age_mae_years": age_mae,
            "lr": current_lr, "elapsed_s": round(elapsed, 1),
        })

        # Save best model
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save({
                "epoch":       epoch,
                "model_state": model.state_dict(),
                "val_loss":    val_loss,
                "val_acc":     val_acc,
                "age_mae":     age_mae,
                "img_size":    IMG_SIZE,
            }, MODEL_PATH)
            print(f"         → saved best model (val_loss={val_loss:.4f})")

    # Save training log
    with open(LOG_PATH, "w") as f:
        json.dump(log, f, indent=2)

    print(f"\nTraining complete. Best model saved to {MODEL_PATH}")
    print(f"Training log saved to {LOG_PATH}")
    print(f"\nBest validation results:")
    best = min(log, key=lambda x: x["val_loss"])
    print(f"  Epoch:          {best['epoch']}")
    print(f"  Gender accuracy:{best['val_gender_acc']:.1%}")
    print(f"  Age MAE:        {best['val_age_mae_years']:.1f} years")


if __name__ == "__main__":
    train()

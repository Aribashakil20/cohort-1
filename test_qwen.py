import torch
import time
import json
import re
from PIL import Image
from transformers import AutoProcessor, AutoModelForImageTextToText

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_NAME   = "Qwen/Qwen2-VL-2B-Instruct"
IMAGE_PATH   = "test.jpg"
MAX_NEW_TOKENS = 80          # keep low for speed on CPU
FALLBACK = {"viewer_count": 1, "male": 1, "female": 0, "engagement": 50}

# ── Detect device ─────────────────────────────────────────────────────────────
device = "cuda" if torch.cuda.is_available() else "cpu"
dtype  = torch.float16 if device == "cuda" else torch.float32
print(f"[1/5] Device: {device.upper()} | dtype: {dtype}")

# ── Load processor & model ────────────────────────────────────────────────────
print("[2/5] Loading processor and model (this may take ~30s on first run)...")
t0 = time.time()
processor = AutoProcessor.from_pretrained(MODEL_NAME)
model = AutoModelForImageTextToText.from_pretrained(
    MODEL_NAME,
    dtype=dtype,
    device_map="auto" if device == "cuda" else None,
    low_cpu_mem_usage=True,
)
if device == "cpu":
    model = model.to("cpu")
model.eval()
print(f"    Model loaded in {time.time()-t0:.1f}s")

# ── Load image ────────────────────────────────────────────────────────────────
print("[3/5] Loading image...")
try:
    image = Image.open(IMAGE_PATH).convert("RGB")
    print(f"    Image loaded: {image.size[0]}x{image.size[1]} px")
except Exception as e:
    print(f"    ERROR loading image: {e}")
    print(f"    OUTPUT: {json.dumps(FALLBACK)}")
    raise SystemExit(1)

# ── Build prompt ──────────────────────────────────────────────────────────────
print("[4/5] Preparing inputs...")
prompt = (
    'Analyze this image. Return ONLY valid JSON with these keys: '
    '"viewer_count" (integer), "male" (integer), "female" (integer), '
    '"engagement" (0-100 integer). No extra text.'
)

messages = [
    {
        "role": "user",
        "content": [
            {"type": "image", "image": image},
            {"type": "text",  "text": prompt},
        ],
    }
]

text   = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = processor(text=[text], images=[image], return_tensors="pt")
inputs = {k: v.to(model.device) for k, v in inputs.items()}
print(f"    Input tokens: {inputs['input_ids'].shape[1]}")

# ── Run inference ─────────────────────────────────────────────────────────────
print("[5/5] Running inference (may be slow on CPU)...")
t1 = time.time()
try:
    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=False,          # greedy — faster & deterministic
            temperature=None,
            top_p=None,
        )
except Exception as e:
    print(f"    ERROR during inference: {e}")
    print(f"\nOUTPUT: {json.dumps(FALLBACK)}")
    raise SystemExit(1)

elapsed = time.time() - t1
print(f"    Inference done in {elapsed:.1f}s")

# ── Decode & parse ────────────────────────────────────────────────────────────
input_len   = inputs["input_ids"].shape[1]
raw_text    = processor.batch_decode(output_ids[:, input_len:], skip_special_tokens=True)[0].strip()
print(f"    Raw model text: {raw_text!r}")

# Extract JSON block (handles extra text if model ignores instructions)
json_match = re.search(r'\{[^{}]+\}', raw_text, re.DOTALL)
result = FALLBACK.copy()

if json_match:
    try:
        parsed = json.loads(json_match.group())
        # Validate and coerce each field to int
        result["viewer_count"] = int(parsed.get("viewer_count", FALLBACK["viewer_count"]))
        result["male"]         = int(parsed.get("male",         FALLBACK["male"]))
        result["female"]       = int(parsed.get("female",       FALLBACK["female"]))
        result["engagement"]   = max(0, min(100, int(parsed.get("engagement", FALLBACK["engagement"]))))
    except (json.JSONDecodeError, ValueError) as e:
        print(f"    WARNING: JSON parse failed ({e}), using fallback values.")
else:
    print("    WARNING: No JSON found in output, using fallback values.")

print("\n" + "="*40)
print("OUTPUT:", json.dumps(result, indent=2))
print("="*40)

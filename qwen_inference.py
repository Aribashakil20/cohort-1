"""
qwen_inference.py
-----------------
Loads the Qwen2-VL model ONCE when this file is imported,
then exposes a single function: qwen_inference(frame) -> dict
"""

import re
import gc
import json
import time
import torch
from PIL import Image
from transformers import AutoProcessor, AutoModelForImageTextToText
from validation import validate_and_clean

# ── Constants ─────────────────────────────────────────────────────────────────
MODEL_NAME     = "Qwen/Qwen2-VL-2B-Instruct"
MAX_NEW_TOKENS = 60          # slightly more room for the JSON output
INFERENCE_SIZE = (480, 360)  # higher resolution = model can see faces clearly
FALLBACK       = {"viewer_count": 0, "male": 0, "female": 0, "engagement": 0}

PROMPT = (
    "Look very carefully at this image. "
    "Count ONLY the clearly visible human faces or bodies. "
    "Do NOT count backgrounds, objects, shadows, or anything that is not a real person. "
    "If you are not sure whether something is a person, do NOT count it. "
    "Be conservative — it is better to count fewer people than to invent extra ones.\n\n"
    "Return ONLY a valid JSON object with exactly these 4 keys. No explanation. No extra text:\n"
    '  "viewer_count": exact number of real people you can clearly see (integer, 0 to 10)\n'
    '  "male": number of clearly male people (integer)\n'
    '  "female": number of clearly female people (integer)\n'
    '  "engagement": how attentive the people look, 0 to 100 (integer)\n\n'
    "Rules you must follow:\n"
    "  - viewer_count must equal the exact number of real visible people — not a guess.\n"
    "  - male + female must add up to exactly viewer_count.\n"
    "  - If you see only 1 person, viewer_count must be 1.\n"
    "  - Never invent people. Never round up.\n\n"
    'Correct example for 1 female person: {"viewer_count": 1, "male": 0, "female": 1, "engagement": 72}\n'
    'Correct example for 2 people: {"viewer_count": 2, "male": 1, "female": 1, "engagement": 65}'
)

# ── Load model once at startup ─────────────────────────────────────────────────
print("[Qwen] Detecting device...")
device = "cuda" if torch.cuda.is_available() else "cpu"
dtype  = torch.float16 if device == "cuda" else torch.float32
print(f"[Qwen] Using {device.upper()} | dtype: {dtype}")

print("[Qwen] Loading model (one-time, please wait)...")
t0 = time.time()

# Allow more visual tokens for the larger 480x360 resolution
processor = AutoProcessor.from_pretrained(MODEL_NAME)
processor.image_processor.max_pixels = INFERENCE_SIZE[0] * INFERENCE_SIZE[1]

model = AutoModelForImageTextToText.from_pretrained(
    MODEL_NAME,
    dtype=dtype,
    device_map="auto" if device == "cuda" else None,
    low_cpu_mem_usage=True,
)

if device == "cpu":
    model = model.to("cpu")

model.eval()
print(f"[Qwen] Model ready in {time.time() - t0:.1f}s\n")


# ── Main inference function ────────────────────────────────────────────────────
def qwen_inference(frame):
    """
    Takes an OpenCV BGR frame (numpy array).
    Returns a dict: {viewer_count, male, female, engagement}
    Falls back to FALLBACK values if anything goes wrong.
    """
    try:
        # Step 1: Convert OpenCV BGR frame → PIL RGB image, resized for speed
        rgb = frame[:, :, ::-1]                        # BGR → RGB
        pil_image = Image.fromarray(rgb).resize(INFERENCE_SIZE, Image.BILINEAR)
        print(f"[Qwen] Image resized to {pil_image.size} for inference")

        # Step 2: Build the chat-style message Qwen2-VL expects
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": pil_image},
                    {"type": "text",  "text": PROMPT},
                ],
            }
        ]

        # Step 3: Apply chat template to insert image tokens correctly
        text   = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = processor(text=[text], images=[pil_image], return_tensors="pt")
        inputs = {k: v.to(model.device) for k, v in inputs.items()}

        # Step 4: Run inference
        t1 = time.time()
        print("[Qwen] Running inference...")
        with torch.no_grad():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,   # greedy decoding = faster & deterministic
                temperature=None,
                top_p=None,
            )
        print(f"[Qwen] Inference done in {time.time() - t1:.1f}s")

        # Step 5: Decode only the newly generated tokens
        input_len = inputs["input_ids"].shape[1]
        raw_text  = processor.batch_decode(
            output_ids[:, input_len:], skip_special_tokens=True
        )[0].strip()
        print(f"[Qwen] Raw output: {raw_text!r}")

        # Step 6: Strip markdown code fences if model wrapped output in ```json ... ```
        cleaned_text = re.sub(r'```(?:json)?', '', raw_text).strip()

        # Extract JSON from the output
        json_match = re.search(r'\{[^{}]+\}', cleaned_text, re.DOTALL)
        if not json_match:
            print("[Qwen] WARNING: No JSON found, using fallback.")
            return FALLBACK.copy()

        parsed = json.loads(json_match.group())

        # Step 7: Validate and return clean dict
        raw_result = {
            "viewer_count": int(parsed.get("viewer_count", FALLBACK["viewer_count"])),
            "male":         int(parsed.get("male",         FALLBACK["male"])),
            "female":       int(parsed.get("female",       FALLBACK["female"])),
            "engagement":   int(parsed.get("engagement",   FALLBACK["engagement"])),
        }
        print(f"[Qwen] Raw parsed: {raw_result}")
        result = validate_and_clean(raw_result)
        print(f"[Qwen] Result: {result}")
        return result

    except Exception as e:
        print(f"[Qwen] ERROR during inference: {e}")
        return FALLBACK.copy()

    finally:
        # Always free tensors after each run to prevent memory buildup
        try:
            del inputs, output_ids
        except NameError:
            pass
        gc.collect()

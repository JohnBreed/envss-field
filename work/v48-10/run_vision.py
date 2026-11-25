#!/usr/bin/env python3
"""Call Google Cloud Vision DOCUMENT_TEXT_DETECTION on the synthetic images.
The API key is read from GOOGLE_VISION_API_KEY and is never printed or written to fixtures."""
from __future__ import annotations
import base64, io, json, os, sys, urllib.request, urllib.error
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
IMG = ROOT / "images"
FIX = ROOT / "fixtures"
FIX.mkdir(exist_ok=True)
MAX_EDGE = 1600
QUALITY = 72

def downscale(path: Path) -> bytes:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    k = min(1.0, MAX_EDGE / max(w, h))
    if k < 1:
        im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=QUALITY, optimize=True)
    return buf.getvalue()

def annotate(jpeg: bytes, key: str) -> dict:
    body = json.dumps({
        "requests": [{
            "image": {"content": base64.b64encode(jpeg).decode("ascii")},
            "features": [{"type": "DOCUMENT_TEXT_DETECTION"}]
        }]
    }).encode("utf-8")
    url = "https://vision.googleapis.com/v1/images:annotate?key=" + key
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        # Strip any accidental key if it appeared
        err = err.replace(key, "[redacted]")
        raise SystemExit(f"Vision HTTP {e.code}: {err[:400]}")

def slim(result: dict) -> dict:
    """Keep text + pages + textAnnotations; drop the raw image and unused fields."""
    resp = (result.get("responses") or [{}])[0]
    if resp.get("error"):
        msg = str(resp["error"])
        return {"error": msg, "text": "", "pages": [], "annotations": []}
    full = resp.get("fullTextAnnotation") or {}
    anns = resp.get("textAnnotations") or []
    # textAnnotations can be large; keep description + boundingPoly only
    slim_anns = []
    for a in anns:
        slim_anns.append({
            "description": a.get("description", ""),
            "boundingPoly": a.get("boundingPoly") or {}
        })
    return {
        "text": full.get("text") or (anns[0].get("description") if anns else ""),
        "pages": full.get("pages") or [],
        "annotations": slim_anns
    }

def main():
    key = (os.environ.get("GOOGLE_VISION_API_KEY") or "").strip()
    if not key:
        sys.exit("GOOGLE_VISION_API_KEY is not set")
    images = sorted(p for p in IMG.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg"})
    summary = []
    for p in images:
        jpeg = downscale(p)
        raw = annotate(jpeg, key)
        data = slim(raw)
        out = FIX / (p.stem + ".json")
        # Never write the key. Store only the Vision document.
        out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        nwords = 0
        for page in data.get("pages") or []:
            for b in page.get("blocks") or []:
                for para in b.get("paragraphs") or []:
                    nwords += len(para.get("words") or [])
        preview = " ".join((data.get("text") or "").split())[:180]
        print(f"{p.name}: {out.stat().st_size} bytes, words={nwords}, jpeg={len(jpeg)}  {preview}")
        summary.append({"image": p.name, "fixture": out.name, "words": nwords, "bytes": out.stat().st_size})
    (FIX / "index.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"wrote {len(summary)} fixtures")

if __name__ == "__main__":
    main()

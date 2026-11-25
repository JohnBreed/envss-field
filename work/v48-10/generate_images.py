#!/usr/bin/env python3
"""Generate synthetic TSI PortaCount fit-test report images for Vision parser tests.
No real worker photos. Output is written under work/v48-10/images/."""
from __future__ import annotations
import math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageOps

OUT = os.path.join(os.path.dirname(__file__), "images")
os.makedirs(OUT, exist_ok=True)

SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANS_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SERIF_B = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

def font(path, size):
    return ImageFont.truetype(path, size)

# Two synthetic reports. The Breed/ENVSS1 set is the established fixture.
# The second is a made-up technician so Vision sees more than one layout fill.
BREED = {
    "id": "breed",
    "header_slash": "25/11/2026",
    "header_nov": "25 NOV 2026",
    "idNumber": "ENVSS1",
    "lastName": "Breed",
    "firstName": "John",
    "company": "ENVSS",
    "location": "Various",
    "testDateSlash": "25/11/2026 10:45",
    "testDateNov": "25 NOV 2026 10:45",
    "dueDateSlash": "25/11/2027",
    "dueDateNov": "25 NOV 2027",
    "portaCountSn": "8048192704",
    "n95": "Yes",
    "respirator": "3M Aura 9322A+ Disposable P2 Flat-fold, 3-panel de [100] N95",
    "manufacturer": "3M",
    "model": "Aura 9322A+",
    "style": "Disposable P2 Flat-fold, 3-panel design with exhalation valve",
    "size": "One Size",
    "protocol": "OSHA FAST-FILTERING FACE",
    "passLevel": "100",
    "approval": "",
    "efficiency": "Yes",
    "exercises": [
        ("BENDING OVER", "50s", "200+", "Yes"),
        ("TALKING", "30", "200+", "Yes"),
        ("HEAD SIDE TO SIDE", "30", "200+", "Yes"),
        ("HEAD UP AND DOWN", "30", "200+", "Yes"),
    ],
    "overall": "200+",
    "overallPass": "Yes",
    "operator": "EA",
    "operatorName": "John Breed",
}

TESTER = {
    "id": "tester",
    "header_slash": "03/03/2026",
    "header_nov": "03 MAR 2026",
    "idNumber": "T-100",
    "lastName": "Tester",
    "firstName": "Sam",
    "company": "Northwind",
    "location": "Site A",
    "testDateSlash": "03/03/2026 14:10",
    "testDateNov": "03 MAR 2026 14:10",
    "dueDateSlash": "03/03/2027",
    "dueDateNov": "03 MAR 2027",
    "portaCountSn": "8048201111",
    "n95": "Yes",
    "respirator": "3M 1870+ Aura disposable [100] N95",
    "manufacturer": "3M",
    "model": "1870+",
    "style": "Disposable flat-fold cup",
    "size": "Standard",
    "protocol": "OSHA FAST-FILTERING FACE",
    "passLevel": "100",
    "approval": "",
    "efficiency": "Yes",
    "exercises": [
        ("BENDING OVER", "50s", "200+", "Yes"),
        ("TALKING", "30", "180", "Yes"),
        ("HEAD SIDE TO SIDE", "30", "200+", "Yes"),
        ("HEAD UP AND DOWN", "30", "200+", "Yes"),
    ],
    "overall": "200+",
    "overallPass": "Yes",
    "operator": "EA",
    "operatorName": "Sam Tester",
}

def wrap(draw, text, font, max_w):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines or [""]

def draw_print(d, date_mode="slash", tight=False):
    """Stacked two-column printed report on a white page (classic PortaCount printout)."""
    W, H = 1240, 1754  # A4-ish at ~150 dpi
    im = Image.new("RGB", (W, H), (255, 255, 255))
    dr = ImageDraw.Draw(im)
    title_f = font(SANS_B if not tight else SANS_B, 28)
    lab_f = font(SANS_B, 16)
    val_f = font(SANS, 18 if not tight else 17)
    small_f = font(SANS, 14)
    # tight month-name dates are kerned closer together
    date_h = d["header_nov"] if date_mode == "nov" else d["header_slash"]
    test_d = d["testDateNov"] if date_mode == "nov" else d["testDateSlash"]
    due_d = d["dueDateNov"] if date_mode == "nov" else d["dueDateSlash"]

    # page margin
    dr.rectangle([40, 40, W-40, H-40], outline=(40, 40, 40), width=2)
    cx = W // 2
    y = 70
    dr.text((cx, y), "FIT TEST REPORT", font=title_f, fill=(0, 0, 0), anchor="mt")
    y += 40
    # tight date: reduce gap between day and month on NOV form
    if date_mode == "nov" and tight:
        # Draw "25NOV2026" with almost no spaces so Vision may merge tokens.
        compact = date_h.replace(" ", "")
        dr.text((cx, y), compact, font=font(SANS_B, 22), fill=(0, 0, 0), anchor="mt")
    else:
        dr.text((cx, y), date_h, font=font(SANS, 22), fill=(0, 0, 0), anchor="mt")
    y += 50

    left_x, right_x = 80, 660
    col_w = 480

    pairs = [
        (("ID NUMBER", d["idNumber"]), ("LAST NAME", d["lastName"])),
        (("FIRST NAME", d["firstName"]), ("COMPANY", d["company"])),
        (("LOCATION", d["location"]), ("TEST DATE", test_d if not (date_mode=="nov" and tight) else test_d.replace(" ", ""))),
        (("DUE DATE", due_d if not (date_mode=="nov" and tight) else due_d.replace(" ", "")), ("PORTACOUNT S/N", d["portaCountSn"])),
        (("N95-COMPANION", d["n95"]), ("RESPIRATOR", d["respirator"])),
        (("MANUFACTURER", d["manufacturer"]), ("MODEL", d["model"])),
        (("RESPIRATOR STYLE", d["style"]), ("RESPIRATOR SIZE", d["size"])),
        (("PROTOCOL", d["protocol"]), ("PASS LEVEL", d["passLevel"])),
        (("APPROVAL", d["approval"] or ""), ("EFFICIENCY<99%", d["efficiency"])),
    ]

    def cell(x, y0, lab, val):
        dr.text((x, y0), lab, font=lab_f, fill=(0, 0, 0))
        lines = wrap(dr, val, val_f, col_w - 10)
        yy = y0 + 24
        for ln in lines:
            dr.text((x, yy), ln, font=val_f, fill=(0, 0, 0))
            yy += 24
        return max(yy, y0 + 24) + 16

    for left, right in pairs:
        y_l = cell(left_x, y, *left)
        y_r = cell(right_x, y, *right)
        y = max(y_l, y_r)

    y += 10
    dr.text((left_x, y), "EXERCISE", font=lab_f, fill=(0, 0, 0))
    dr.text((left_x + 320, y), "DURATION", font=lab_f, fill=(0, 0, 0))
    dr.text((left_x + 480, y), "FIT FACTOR", font=lab_f, fill=(0, 0, 0))
    dr.text((left_x + 680, y), "PASS", font=lab_f, fill=(0, 0, 0))
    y += 28
    dr.line((left_x, y-6, W-80, y-6), fill=(0, 0, 0), width=1)
    for ex, dur, ff, p in d["exercises"]:
        dr.text((left_x, y), ex, font=val_f, fill=(0, 0, 0))
        dr.text((left_x + 320, y), dur, font=val_f, fill=(0, 0, 0))
        dr.text((left_x + 480, y), ff, font=val_f, fill=(0, 0, 0))
        dr.text((left_x + 680, y), p, font=val_f, fill=(0, 0, 0))
        y += 28
    y += 12
    dr.text((left_x, y), "OVERALL FF", font=lab_f, fill=(0, 0, 0))
    dr.text((left_x + 480, y), d["overall"], font=val_f, fill=(0, 0, 0))
    dr.text((left_x + 680, y), d["overallPass"], font=val_f, fill=(0, 0, 0))
    y += 48
    dr.text((left_x, y), "FITTEST OPERATOR", font=lab_f, fill=(0, 0, 0))
    dr.text((left_x + 280, y), d["operator"], font=val_f, fill=(0, 0, 0))
    y += 32
    dr.text((left_x, y), "NAME", font=lab_f, fill=(0, 0, 0))
    dr.text((left_x + 280, y), d["operatorName"], font=val_f, fill=(0, 0, 0))
    return im

def draw_screen(d, date_mode="slash"):
    """TSI software-style window: two columns of label + value on the same row."""
    W, H = 1400, 1000
    im = Image.new("RGB", (W, H), (240, 240, 245))
    dr = ImageDraw.Draw(im)
    dr.rectangle([16, 16, W-16, H-16], fill=(255, 255, 255), outline=(80, 80, 90), width=2)
    title_f = font(SANS_B, 22)
    lab_f = font(SANS, 15)
    val_f = font(SANS_B, 15)
    date_h = d["header_nov"] if date_mode == "nov" else d["header_slash"]
    test_d = d["testDateNov"] if date_mode == "nov" else d["testDateSlash"]
    due_d = d["dueDateNov"] if date_mode == "nov" else d["dueDateSlash"]
    y = 36
    dr.text((40, y), "FIT TEST REPORT", font=title_f, fill=(20, 20, 40))
    dr.text((W-40, y), date_h, font=title_f, fill=(20, 20, 40), anchor="rt")
    y += 44
    dr.line((40, y, W-40, y), fill=(180, 180, 190), width=1)
    y += 16

    # each row: L-label, L-value, R-label, R-value
    lx, lv, rx, rv = 48, 280, 740, 980
    rows = [
        ("ID NUMBER", d["idNumber"], "LAST NAME", d["lastName"]),
        ("FIRST NAME", d["firstName"], "COMPANY", d["company"]),
        ("LOCATION", d["location"], "TEST DATE", test_d),
        ("DUE DATE", due_d, "PORTACOUNT S/N", d["portaCountSn"]),
        ("N95-COMPANION", d["n95"], "RESPIRATOR", d["respirator"]),
        ("MANUFACTURER", d["manufacturer"], "MODEL", d["model"]),
        ("RESPIRATOR STYLE", d["style"], "RESPIRATOR SIZE", d["size"]),
        ("PROTOCOL", d["protocol"], "PASS LEVEL", d["passLevel"]),
        ("APPROVAL", d["approval"] or " ", "EFFICIENCY<99%", d["efficiency"]),
    ]
    for a,b,c,e in rows:
        # wrap long values under themselves
        def val_block(x, text):
            lines = wrap(dr, text, val_f, 430)
            yy = y
            for ln in lines:
                dr.text((x, yy), ln, font=val_f, fill=(10, 10, 20))
                yy += 20
            return yy
        dr.text((lx, y), a, font=lab_f, fill=(80, 80, 90))
        y1 = val_block(lv, b)
        dr.text((rx, y), c, font=lab_f, fill=(80, 80, 90))
        y2 = val_block(rv, e)
        y = max(y1, y2, y + 22) + 8

    y += 8
    dr.line((40, y, W-40, y), fill=(180, 180, 190), width=1)
    y += 12
    heads = [("EXERCISE", 48), ("DURATION", 420), ("FIT FACTOR", 620), ("PASS", 860)]
    for h, x in heads:
        dr.text((x, y), h, font=lab_f, fill=(80, 80, 90))
    y += 24
    for ex, dur, ff, p in d["exercises"]:
        dr.text((48, y), ex, font=val_f, fill=(10, 10, 20))
        dr.text((420, y), dur, font=val_f, fill=(10, 10, 20))
        dr.text((620, y), ff, font=val_f, fill=(10, 10, 20))
        dr.text((860, y), p, font=val_f, fill=(10, 10, 20))
        y += 24
    y += 8
    dr.text((48, y), "OVERALL FF", font=lab_f, fill=(80, 80, 90))
    dr.text((620, y), d["overall"], font=val_f, fill=(10, 10, 20))
    dr.text((860, y), d["overallPass"], font=val_f, fill=(10, 10, 20))
    y += 36
    dr.text((48, y), "FITTEST OPERATOR", font=lab_f, fill=(80, 80, 90))
    dr.text((280, y), d["operator"], font=val_f, fill=(10, 10, 20))
    y += 24
    dr.text((48, y), "NAME", font=lab_f, fill=(80, 80, 90))
    dr.text((280, y), d["operatorName"], font=val_f, fill=(10, 10, 20))
    return im

def perspective(im, strength=0.12, rotate_deg=7):
    """Simulate a phone photo of a printed page, slightly tilted on a desk."""
    im = im.convert("RGB")
    # rotate first
    im = im.rotate(rotate_deg, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(230, 228, 222))
    w, h = im.size
    dx = int(w * strength)
    # dest quad: top narrower / shifted
    src = (0, 0, w, 0, w, h, 0, h)
    dest = (dx, int(h * 0.04), w - dx // 3, int(h * 0.02), w - dx // 6, h - int(h * 0.03), int(dx * 0.4), h - int(h * 0.01))
    coeffs = _find_coeffs(dest, src) if False else _perspective_coeffs(w, h, dest)
    # Use built-in transform with quad
    try:
        out = im.transform((w, h), Image.Transform.QUAD, dest, resample=Image.Resampling.BICUBIC, fillcolor=(230, 228, 222))
    except Exception:
        out = im
    # paste onto a slightly larger "desk"
    pad = 80
    canvas = Image.new("RGB", (w + pad * 2, h + pad * 2), (214, 210, 200))
    # faint shadow
    sh = Image.new("RGB", (w, h), (40, 40, 40))
    canvas.paste(sh, (pad + 10, pad + 14))
    canvas.paste(out, (pad, pad))
    return canvas

def _perspective_coeffs(w, h, dest):
    return dest

def low_contrast(im):
    im = ImageEnhance.Contrast(im).enhance(0.45)
    im = ImageEnhance.Brightness(im).enhance(1.08)
    im = im.filter(ImageFilter.GaussianBlur(radius=0.7))
    # slight wash
    wash = Image.new("RGB", im.size, (200, 200, 198))
    return Image.blend(im, wash, 0.18)

def save(im, name, quality=88):
    path = os.path.join(OUT, name)
    if name.endswith(".png"):
        im.save(path, "PNG", optimize=True)
    else:
        im.save(path, "JPEG", quality=quality, optimize=True)
    print(f"wrote {path} {os.path.getsize(path)} {im.size}")
    return path

def main():
    jobs = []
    for data in (BREED, TESTER):
        ident = data["id"]
        jobs.append((draw_print(data, "slash"), f"print_{ident}.png"))
        jobs.append((draw_screen(data, "slash"), f"screen_{ident}.png"))
    # Breed extras: printed NOV dates (tight), tilted, low contrast, screen tilted
    jobs.append((draw_print(BREED, "nov", tight=True), "print_breed_novtight.png"))
    jobs.append((draw_screen(BREED, "nov"), "screen_breed_nov.png"))
    pr = draw_print(BREED, "slash")
    jobs.append((perspective(pr, 0.14, 8), "print_breed_tilted.jpg"))
    jobs.append((low_contrast(pr), "print_breed_lowcontrast.jpg"))
    sc = draw_screen(BREED, "slash")
    jobs.append((perspective(sc, 0.10, -6), "screen_breed_tilted.jpg"))
    jobs.append((low_contrast(draw_print(TESTER, "slash")), "print_tester_lowcontrast.jpg"))
    jobs.append((perspective(draw_print(TESTER, "slash"), 0.13, 9), "print_tester_tilted.jpg"))

    for im, name in jobs:
        save(im, name)

if __name__ == "__main__":
    main()

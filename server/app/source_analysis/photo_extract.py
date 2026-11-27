"""DEV-452: find product photos inside uploaded documents (PDF pages, detail-page screenshots).

Runs inside the bounded preprocess subprocess. No provider calls. Every result is a
proposal: the producer confirms or removes each extracted photo before a sale request.

- PDF pages: embedded image objects (including those nested in form XObjects) give exact
  bounds. The crop is taken from the rendered page, so masks/overlays match what people see.
- Raster documents, and PDF pages without usable image objects: a layout heuristic finds
  large, colourful, low-text blocks on a coarse grid.
"""

from __future__ import annotations

import base64
import io
import math

from PIL import Image, ImageStat

PHOTO_VERSION = "doc-photo-v1"
MAX_PHOTOS_PER_PAGE = 6
MAX_SIDE = 1600
MIN_SIDE_PX = 160
MIN_SIDE_RATIO = 0.12  # of page width
MIN_AREA_RATIO = 0.02
MAX_TEXT_COVER = 0.25
MIN_ENTROPY = 4.2  # bits, 64-colour adaptive palette
TEXT_BAND_WIDTH = 0.25  # of block width: a text line this wide is a caption, not a label
TEXT_EDGE_RATIO = 0.15  # of block height: text this close to the top/bottom edge is a caption
GRID = 8  # px per cell for the layout heuristic (on a 400px-wide copy)


def _area(b):
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _overlap(a, b):
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    return _area((x1, y1, x2, y2))


def _span_box(span):
    """Spans use [x1, y1, x2, y2] normalized boxes."""
    b = span.get("box") or [0, 0, 0, 0]
    return (float(b[0]), float(b[1]), float(b[2]), float(b[3]))


def text_cover(box, spans):
    area = _area(box)
    if area <= 0:
        return 1.0
    return min(1.0, sum(_overlap(box, _span_box(s)) for s in spans) / area)


def entropy(image):
    small = image.copy()
    small.thumbnail((256, 256))
    pal = small.convert("P", palette=Image.ADAPTIVE, colors=64)
    hist = [c for c in pal.histogram()[:64] if c]
    total = sum(hist)
    return -sum((c / total) * math.log2(c / total) for c in hist)


def _photo_like(image, box, spans):
    width, height = image.size
    w, h = (box[2] - box[0]) * width, (box[3] - box[1]) * height
    # Sizes are relative to page width so long detail-page screenshots are judged like normal pages.
    if min(w, h) < MIN_SIDE_PX or min(w, h) < MIN_SIDE_RATIO * width:
        return False
    if w * h < MIN_AREA_RATIO * width * min(width, height) * 2:
        return False
    if text_cover(box, spans) > MAX_TEXT_COVER:
        return False
    crop = image.crop(_pixels(box, image.size))
    stat = ImageStat.Stat(crop.convert("L"))
    if stat.stddev[0] < 18:
        return False
    return entropy(crop) >= MIN_ENTROPY and not graphic(crop)


def graphic(image):
    """Logos, stamps, banners: a few flat colours cover most of the area."""
    small = image.copy()
    small.thumbnail((128, 128))
    hist = sorted(
        small.convert("P", palette=Image.ADAPTIVE, colors=32).histogram()[:32], reverse=True
    )
    return sum(hist[:3]) > 0.6 * sum(hist)


def dhash(encoded):
    """64-bit difference hash of a base64 PNG, for near-duplicate photos across pages."""
    with Image.open(io.BytesIO(base64.b64decode(encoded))) as image:
        g = image.convert("L").resize((9, 8))
    px = list(g.tobytes())
    return sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])


def near_duplicate(a, b, distance=8):
    return bin(a ^ b).count("1") <= distance


def _pixels(box, size):
    w, h = size
    return (
        max(0, int(box[0] * w)),
        max(0, int(box[1] * h)),
        min(w, math.ceil(box[2] * w)),
        min(h, math.ceil(box[3] * h)),
    )


def _merge(boxes):
    """Merge boxes that mostly overlap (nested image objects, tiled images)."""
    boxes = sorted(boxes, key=_area, reverse=True)
    kept = []
    for b in boxes:
        if any(_overlap(b, k) > 0.6 * min(_area(b), _area(k)) for k in kept):
            continue
        kept.append(b)
    return kept


def _encode(image, box):
    crop = image.crop(_pixels(box, image.size))
    crop.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    crop.save(out, "PNG", optimize=True)
    return base64.b64encode(out.getvalue()).decode()


def pdf_image_boxes(page):
    """Normalized [x1, y1, x2, y2] (top-left origin) of image objects on a pypdfium2 page."""
    import pypdfium2 as pdfium
    import pypdfium2.raw as raw

    width, height = page.get_size()
    boxes = []
    try:
        objects = page.get_objects(filter=[raw.FPDF_PAGEOBJ_IMAGE], max_depth=4)
        for obj in objects:
            try:
                left, bottom, right, top = obj.get_bounds()
            except Exception:  # noqa: BLE001 - malformed object; skip it
                continue
            box = (
                max(0.0, left / width),
                max(0.0, 1 - top / height),
                min(1.0, right / width),
                min(1.0, 1 - bottom / height),
            )
            if box[2] > box[0] and box[3] > box[1]:
                boxes.append(box)
            if len(boxes) >= 200:
                break
    except pdfium.PdfiumError:
        return []
    return boxes


def layout_boxes(image, spans):
    """Large colourful non-text blocks on a coarse grid (screenshots, scanned pages)."""
    scale = 400 / image.width
    small = image.resize((400, max(1, int(image.height * scale))))
    cols, rows = small.width // GRID, small.height // GRID
    if not cols or not rows:
        return []
    # Background: the most common quantized colour.
    q = small.quantize(colors=16)
    counts = sorted(enumerate(q.histogram()[:16]), key=lambda c: -c[1])
    background = counts[0][0]
    qpx = q.load()
    text = [_span_box(s) for s in spans]
    filled = [[False] * cols for _ in range(rows)]
    for r in range(rows):
        for c in range(cols):
            cell = (
                c * GRID / small.width,
                r * GRID / small.height,
                (c + 1) * GRID / small.width,
                (r + 1) * GRID / small.height,
            )
            if any(_overlap(cell, t) > 0.3 * _area(cell) for t in text):
                continue
            busy = sum(
                1
                for y in range(r * GRID, (r + 1) * GRID, 2)
                for x in range(c * GRID, (c + 1) * GRID, 2)
                if qpx[x, y] != background
            )
            # Smooth photo areas (sky, white table) still count; flatness is judged per block.
            filled[r][c] = busy >= 10
    seen = [[False] * cols for _ in range(rows)]
    boxes = []
    for r in range(rows):
        for c in range(cols):
            if not filled[r][c] or seen[r][c]:
                continue
            stack, cells = [(r, c)], []
            seen[r][c] = True
            while stack:
                y, x = stack.pop()
                cells.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < rows and 0 <= nx < cols and filled[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((ny, nx))
            ys, xs = [y for y, _ in cells], [x for _, x in cells]
            box = (
                min(xs) * GRID / small.width,
                min(ys) * GRID / small.height,
                (max(xs) + 1) * GRID / small.width,
                (max(ys) + 1) * GRID / small.height,
            )
            bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
            # Mostly-solid blocks only: a scatter of icons/letters is not a photo.
            if len(cells) >= 0.55 * bw * bh:
                boxes.append(box)
    return boxes


def trim_text_bands(box, spans, image_size=None):
    """Cut OCR text rows (a price line under a photo, a caption) out of a photo block.

    Layout blocks and whole-page PDF image objects can include the text band next to
    the photo. Rows covered by spans that mostly lie inside the box are removed and the
    largest remaining text-free band is kept. Returns the new box, the same box when it
    holds no text, or None when no band is large enough to be a photo.
    """
    height = box[3] - box[1]
    width = box[2] - box[0]
    if height <= 0 or width <= 0:
        return None
    runs = []
    for s in spans:
        sb = _span_box(s)
        if _area(sb) <= 0 or _overlap(box, sb) < 0.5 * _area(sb):
            continue
        runs.append((max(box[1], sb[1]), min(box[3], sb[3]), sb[2] - sb[0]))
    if not runs:
        return box
    runs.sort()
    gap = 0.004 * 2  # closes the space between lines of one block
    merged = [list(runs[0])]
    for a, b, w in runs[1:]:
        if a <= merged[-1][1] + gap:
            merged[-1][1] = max(merged[-1][1], b)
            merged[-1][2] = max(merged[-1][2], w)
        else:
            merged.append([a, b, w])
    # A caption or price line runs across the block or sits at its edge. Small words inside
    # the picture (stickers, box logos) are part of the photo and do not split it.
    edge = TEXT_EDGE_RATIO * height
    merged = [
        (a, b)
        for a, b, w in merged
        if w >= TEXT_BAND_WIDTH * width or a <= box[1] + edge or b >= box[3] - edge
    ]
    if not merged:
        return box
    bands, cursor = [], box[1]
    for a, b in merged:
        if a > cursor:
            bands.append((cursor, a))
        cursor = max(cursor, b)
    if cursor < box[3]:
        bands.append((cursor, box[3]))
    if not bands:
        return None
    top, bottom = max(bands, key=lambda band: band[1] - band[0])
    trimmed = (box[0], top, box[2], bottom)
    if image_size:
        w, h = image_size
        side = min((trimmed[2] - trimmed[0]) * w, (trimmed[3] - trimmed[1]) * h)
        if side < MIN_SIDE_PX or side < MIN_SIDE_RATIO * w:
            return None
    # A sliver of a big block is not the photo; the rest was mostly text.
    if (bottom - top) < 0.3 * height and (bottom - top) != height:
        return None
    return trimmed


def find_photos(image, spans, pdf_page=None):
    """Return [{"image": base64 PNG, "box": [x1, y1, x2, y2], "method": str}] for one page."""
    candidates = []
    if pdf_page is not None:
        candidates = [(b, "pdf-object") for b in _merge(pdf_image_boxes(pdf_page))]
        candidates = [(b, m) for b, m in candidates if _area(b) < 0.97]  # full-page backgrounds
    if not candidates:
        candidates = [(b, "layout") for b in _merge(layout_boxes(image, spans))]
    found = []
    for box, method in sorted(candidates, key=lambda c: (c[0][1], c[0][0])):
        box = trim_text_bands(box, spans, image.size)
        if box is None or not _photo_like(image, box, spans):
            continue
        found.append(
            {"image": _encode(image, box), "box": [round(v, 4) for v in box], "method": method}
        )
        if len(found) >= MAX_PHOTOS_PER_PAGE:
            break
    return found


FIELD_RULES = (
    (
        "farmPhotos",
        (
            "농장",
            "농부",
            "농가",
            "가족",
            "대째",
            "부부",
            "아버지",
            "어머니",
            "과수원",
            "대표",
            "이야기",
        ),
    ),
    ("packagePhoto", ("포장", "박스", "상자", "선물", "패키지", "배송")),
    ("crossSectionPhoto", ("단면", "속살", "과육", "자른")),
    ("qualityEvidence", ("당도", "브릭스", "brix", "선별", "비파괴", "재배", "수확", "인증")),
    ("sizePhoto", ("크기", "사이즈", "중량", "과내", "규격")),
)


def field_for(box, spans):
    """Pick a page section for an extracted photo from text right around it."""
    top, bottom = box[1] - 0.15, box[3] + 0.15
    near = " ".join(
        s.get("text", "") for s in spans if _span_box(s)[3] >= top and _span_box(s)[1] <= bottom
    ).lower()
    for key, words in FIELD_RULES:
        if any(w in near for w in words):
            return key
    return "taste"

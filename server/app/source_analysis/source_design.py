"""Deterministic raster preparation and exact-pixel compilation of visual plans."""

import base64
import copy
import hashlib
import io
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.ai.source_design import GROUPS, LAYOUTS, MODEL, PROMPT_VERSION, ROLES, TONES

ROLE_GROUPS = {
    "hero": {"intro"},
    "product": {"intro", "composition", "taste"},
    "packaging": {"composition", "packing"},
    "cutFruit": {"taste"},
    "sizeGuide": {"taste"},
    "process": {"production", "packing", "farm"},
}


@dataclass
class PreparedSource:
    source_id: str
    source_sha256: str
    width: int
    height: int
    image: Image.Image
    exif_orientation: int = 1


def _fail():
    raise ValueError("Invalid automatic source design")


def _id(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", value)


def _object(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        _fail()


def _bounds(value, width, height):
    if type(value) is not list or len(value) != 4 or any(type(x) is not int for x in value):
        _fail()
    left, top, right, bottom = value
    if not (0 <= left < right <= width and 0 <= top < bottom <= height):
        _fail()
    return left, top, right, bottom


def prepare_raster(data: bytes, source_id: str) -> PreparedSource:
    if type(data) is not bytes or not data or len(data) > 20 * 1024 * 1024 or not _id(source_id):
        _fail()
    try:
        with Image.open(io.BytesIO(data)) as raw:
            if (
                raw.format not in {"PNG", "JPEG"}
                or getattr(raw, "n_frames", 1) != 1
                or raw.width * raw.height > 40_000_000
            ):
                _fail()
            orientation = raw.getexif().get(274, 1)
            raw.load()
            upright = ImageOps.exif_transpose(raw)
            if "A" in upright.getbands() or "transparency" in upright.info:
                rgba = upright.convert("RGBA")
                image = Image.new("RGB", rgba.size, "white")
                image.paste(rgba, mask=rgba.getchannel("A"))
            else:
                image = upright.convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("Invalid source raster") from exc
    return PreparedSource(
        source_id, hashlib.sha256(data).hexdigest(), *image.size, image, orientation
    )


def make_tiles(source: PreparedSource, profile="standard") -> list[dict]:
    profiles = {"standard": (2400, 1200, 768, 1_500_000), "compact": (3600, 1800, 384, 400_000)}
    if not isinstance(profile, str) or profile not in profiles:
        raise ValueError("Unknown source tile profile")
    tile_height, stride, max_width, encoded_limit = profiles[profile]
    bounds, top = [], 0
    while top < source.height:
        if len(bounds) >= 24:
            raise ValueError("Source tile limit")
        bottom = min(source.height, top + tile_height)
        bounds.append([0, top, source.width, bottom])
        if bottom == source.height:
            break
        top += stride
    for quality in (65, 50, 40, 30):
        tiles, encoded_size = [], 0
        for box in bounds:
            image = source.image.crop(tuple(box))
            if image.width > max_width:
                image = image.resize(
                    (max_width, max(1, round(image.height * max_width / image.width))),
                    Image.Resampling.LANCZOS,
                )
            buf = io.BytesIO()
            image.save(buf, "JPEG", quality=quality)
            encoded = base64.b64encode(buf.getvalue()).decode("ascii")
            encoded_size += len(encoded)
            if encoded_size > encoded_limit:
                break
            tiles.append(
                {
                    "id": f"tile-{len(tiles):02d}",
                    "bounds": list(box),
                    "width": image.width,
                    "height": image.height,
                    "image": encoded,
                    "jpegQuality": quality,
                    "profile": profile,
                }
            )
        if len(tiles) == len(bounds):
            return tiles
    raise ValueError("Source encoded tile limit")


def _contentful(module):
    return (
        any(t["value"].strip() for t in module["texts"])
        or bool(module.get("photos"))
        or bool(module.get("illustrationId"))
    )


def _native_bounds(tile, bounds):
    left, top, right, bottom = _bounds(bounds, 1000, 1000)
    tl, tt, tr, tb = tile["bounds"]
    return [
        tl + left * (tr - tl) // 1000,
        tt + top * (tb - tt) // 1000,
        tl + (right * (tr - tl) + 999) // 1000,
        tt + (bottom * (tb - tt) + 999) // 1000,
    ]


def _comparison_contexts(source, tiles, plan):
    _object(plan, ["theme", "regions", "sections", "warnings"])
    if type(plan["regions"]) is not list or len(plan["regions"]) > 12:
        _fail()
    tile_map = {}
    for tile in tiles:
        if not _id(tile.get("id")) or tile["id"] in tile_map:
            _fail()
        _bounds(tile["bounds"], source.width, source.height)
        tile_map[tile["id"]] = tile
    ordered = sorted(tile_map, key=lambda key: tile_map[key]["bounds"][1])
    result = {}
    for region in plan["regions"]:
        _object(region, ["id", "tileId", "bounds", "kind", "role", "confidence", "complete"])
        if region["kind"] != "comparison":
            continue
        if (
            not _id(region["id"])
            or region["id"] in result
            or region["role"] != "sizeGuide"
            or not _id(region["tileId"])
            or region["tileId"] not in tile_map
        ):
            _fail()
        native = _native_bounds(tile_map[region["tileId"]], region["bounds"])
        if min(native[2] - native[0], native[3] - native[1]) < 64:
            _fail()
        index = ordered.index(region["tileId"])
        allowed = {region["tileId"]}
        if region["bounds"][1] <= 150 and index > 0:
            allowed.add(ordered[index - 1])
        if region["bounds"][3] >= 850 and index + 1 < len(ordered):
            allowed.add(ordered[index + 1])
        result[region["id"]] = {"region": region, "nativeBounds": native, "allowed": allowed}
    return tile_map, result


def comparison_review_images(source, tiles, plan):
    """Source-only context/proposal copies; no manually chosen region or overlay."""
    tile_map, candidates = _comparison_contexts(source, tiles, plan)
    images, included = [], set()

    def image_entry(identity, bounds, purpose, **metadata):
        image = source.image.crop(tuple(bounds))
        if image.width > 768:
            image = image.resize(
                (768, max(1, round(image.height * 768 / image.width))), Image.Resampling.LANCZOS
            )
        buf = io.BytesIO()
        image.save(buf, "JPEG", quality=65)
        return {
            "id": identity,
            "bounds": list(bounds),
            "width": image.width,
            "height": image.height,
            "image": base64.b64encode(buf.getvalue()).decode("ascii"),
            "purpose": purpose,
            "jpegQuality": 65,
            **metadata,
        }

    for rid, candidate in candidates.items():
        for tile_id in sorted(candidate["allowed"]):
            if tile_id not in included:
                images.append(
                    image_entry(tile_id, tile_map[tile_id]["bounds"], "context", tileId=tile_id)
                )
                included.add(tile_id)
        images.append(
            image_entry(
                "proposal-" + rid,
                candidate["nativeBounds"],
                "proposal",
                regionId=rid,
                tileId=candidate["region"]["tileId"],
            )
        )
    return images


def apply_comparison_review(source, tiles, plan, review):
    """Malformed, absent or unverifiable review abstains all diagrams; never repairs it."""
    tile_map, candidates = _comparison_contexts(source, tiles, plan)
    output = copy.deepcopy(plan)
    for region in output["regions"]:
        if region["kind"] == "comparison":
            region["complete"] = False
    try:
        _object(review, ["reviews"])
        if type(review["reviews"]) is not list or len(review["reviews"]) != len(candidates):
            _fail()
        updates = {}
        for item in review["reviews"]:
            _object(item, ["regionId", "tileId", "bounds", "confidence", "verdict"])
            rid = item["regionId"]
            if (
                not _id(rid)
                or rid not in candidates
                or rid in updates
                or not _id(item["tileId"])
                or item["tileId"] not in candidates[rid]["allowed"]
                or type(item["confidence"]) not in {int, float}
                or not math.isfinite(item["confidence"])
                or not 0 <= item["confidence"] <= 1
                or item["verdict"] not in ["KEEP_COMPLETE", "EXPAND_COMPLETE", "ABSTAIN"]
            ):
                _fail()
            native = _native_bounds(tile_map[item["tileId"]], item["bounds"])
            original = candidates[rid]["nativeBounds"]
            if item["verdict"] != "ABSTAIN":
                if (
                    native[0] > original[0]
                    or native[1] > original[1]
                    or native[2] < original[2]
                    or native[3] < original[3]
                ):
                    _fail()
                if item["verdict"] == "KEEP_COMPLETE" and native != original:
                    _fail()
            updates[rid] = item
        if set(updates) != set(candidates):
            _fail()
        for region in output["regions"]:
            if region["id"] in updates:
                item = updates[region["id"]]
                complete = item["verdict"] != "ABSTAIN"
                region.update(confidence=item["confidence"], complete=complete)
                if complete:
                    region.update(tileId=item["tileId"], bounds=list(item["bounds"]))
        output["warnings"].append("AUTOMATIC_COMPARISON_REVIEW_PENDING_HUMAN_REVIEW")
    except (ValueError, TypeError, KeyError):
        output["warnings"].append("COMPARISON_REVIEW_INVALID_OR_MISSING_ABSTAINED")
    return output


def validate_modules(modules):
    if type(modules) is not list or not modules or len(modules) > 18:
        _fail()
    module_map = {}
    for m in modules:
        if (
            type(m) is not dict
            or not _id(m.get("id"))
            or m["id"] not in GROUPS
            or m["id"] in module_map
            or type(m.get("texts")) is not list
            or type(m.get("photos", [])) is not list
            or m.get("illustrationId")
        ):
            _fail()
        if any(type(t) is not dict or not isinstance(t.get("value"), str) for t in m["texts"]):
            _fail()
        module_map[m["id"]] = m
    if not any(_contentful(m) for m in modules):
        _fail()
    return module_map


def compile_plan(source, tiles, modules, plan, outdir: Path) -> dict:
    _object(plan, ["theme", "regions", "sections", "warnings"])
    if (
        plan["theme"] != "citrus-warm"
        or type(plan["regions"]) is not list
        or len(plan["regions"]) > 12
        or type(plan["sections"]) is not list
        or not 1 <= len(plan["sections"]) <= 24
        or type(plan["warnings"]) is not list
        or len(plan["warnings"]) > 24
        or any(not isinstance(w, str) or len(w) > 1000 for w in plan["warnings"])
    ):
        _fail()
    module_map = validate_modules(modules)
    tile_map = {}
    for tile in tiles:
        if not _id(tile.get("id")) or tile["id"] in tile_map:
            _fail()
        _bounds(tile["bounds"], source.width, source.height)
        tile_map[tile["id"]] = tile
    region_map, records, native_regions = {}, [], set()
    for region in plan["regions"]:
        _object(region, ["id", "tileId", "bounds", "kind", "role", "confidence", "complete"])
        if (
            not _id(region["id"])
            or region["id"] in region_map
            or not _id(region["tileId"])
            or region["tileId"] not in tile_map
            or region["kind"] not in ["photo", "comparison"]
            or region["role"] not in ROLES
            or type(region["confidence"]) not in {int, float}
            or not math.isfinite(region["confidence"])
            or not 0 <= region["confidence"] <= 1
            or type(region["complete"]) is not bool
        ):
            _fail()
        if (region["role"] == "sizeGuide") != (region["kind"] == "comparison"):
            _fail()
        left, top, right, bottom = _bounds(region["bounds"], 1000, 1000)
        tl, tt, tr, tb = tile_map[region["tileId"]]["bounds"]
        native = [
            tl + (left * (tr - tl)) // 1000,
            tt + (top * (tb - tt)) // 1000,
            tl + math.ceil(right * (tr - tl) / 1000),
            tt + math.ceil(bottom * (tb - tt) / 1000),
        ]
        if (
            min(native[2] - native[0], native[3] - native[1]) < 64
            or tuple(native) in native_regions
        ):
            _fail()
        model_native = list(native)
        margin = 0
        if region["kind"] == "comparison":
            margin = math.ceil(max(native[2] - native[0], native[3] - native[1]) * 0.08)
            context = tile_map[region["tileId"]]["bounds"]
            native = [
                max(context[0], native[0] - margin),
                max(context[1], native[1] - margin),
                min(context[2], native[2] + margin),
                min(context[3], native[3] + margin),
            ]
            if tuple(native) in native_regions:
                _fail()
        native_regions.add(tuple(native))
        accepted = region["complete"] and region["confidence"] >= (
            0.8 if region["kind"] == "comparison" else 0.7
        )
        reason = (
            "ACCEPTED_PENDING_HUMAN_REVIEW"
            if accepted
            else ("INCOMPLETE_REGION" if not region["complete"] else "LOW_CONFIDENCE")
        )
        record = {
            **copy.deepcopy(region),
            "nativeBounds": native,
            "modelNativeBounds": model_native,
            "contextMarginPixels": margin,
            "width": native[2] - native[0],
            "height": native[3] - native[1],
            "status": "ACCEPTED" if accepted else "ABSTAINED",
            "reason": reason,
        }
        region_map[region["id"]] = record
        records.append(record)
    used_modules, used_regions, used_sections = set(), set(), set()
    sections = []
    for section in plan["sections"]:
        _object(section, ["id", "group", "layout", "tone", "moduleIds", "regionIds"])
        if (
            not _id(section["id"])
            or section["id"] in used_sections
            or section["group"] not in GROUPS.values()
            or section["layout"] not in LAYOUTS
            or section["tone"] not in TONES
            or type(section["moduleIds"]) is not list
            or type(section["regionIds"]) is not list
            or not (section["moduleIds"] or section["regionIds"])
        ):
            _fail()
        used_sections.add(section["id"])
        for mid in section["moduleIds"]:
            if (
                not _id(mid)
                or mid not in module_map
                or mid in used_modules
                or GROUPS[mid] != section["group"]
            ):
                _fail()
            used_modules.add(mid)
        for rid in section["regionIds"]:
            if not _id(rid) or rid not in region_map or rid in used_regions:
                _fail()
            if section["group"] not in ROLE_GROUPS[region_map[rid]["role"]]:
                _fail()
            used_regions.add(rid)
        media_ids = [rid for rid in section["regionIds"] if region_map[rid]["status"] == "ACCEPTED"]
        if media_ids or any(_contentful(module_map[mid]) for mid in section["moduleIds"]):
            sections.append(
                {
                    k: copy.deepcopy(section[k])
                    for k in ("id", "group", "layout", "tone", "moduleIds")
                }
                | {"mediaIds": media_ids}
            )
    if (
        used_regions != set(region_map)
        or any(_contentful(m) and mid not in used_modules for mid, m in module_map.items())
        or not sections
    ):
        _fail()
    # No files are created until the entire untrusted plan passes validation.
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=False)
    media, assets = {}, []
    alts = {
        "hero": "원문 상품 사진",
        "product": "원문 상품 사진",
        "packaging": "원문 포장 사진",
        "cutFruit": "원문 단면 사진",
        "sizeGuide": "원문 크기 비교 그림",
        "process": "원문 작업 사진",
    }
    for record in records:
        if record["status"] != "ACCEPTED":
            continue
        identity = json.dumps(
            [source.source_sha256, record["nativeBounds"], PROMPT_VERSION], separators=(",", ":")
        ).encode()
        region_id = "region-" + hashlib.sha256(identity).hexdigest()
        name = region_id + ".png"
        cropped = source.image.crop(tuple(record["nativeBounds"]))
        buf = io.BytesIO()
        cropped.save(buf, "PNG")
        data = buf.getvalue()
        digest = hashlib.sha256(data).hexdigest()
        path = outdir / name
        path.write_bytes(data)
        with Image.open(path) as saved:
            if saved.size != cropped.size or saved.tobytes() != cropped.tobytes():
                raise ValueError("Crop pixel verification failed")
        record.update(sourceRegionId=region_id, cropSha256=digest, imagePath=name)
        media[record["id"]] = {
            "uri": "/__automatic_design/" + name,
            "alt": alts[record["role"]],
            "width": cropped.width,
            "height": cropped.height,
            "kind": record["kind"],
            "sourceId": source.source_id,
            "sourceSha256": source.source_sha256,
            "sourceRegionId": region_id,
        }
        assets.append({"path": str(path.resolve()), "name": name, "sha256": digest})
    return {
        "content": {"modules": copy.deepcopy(modules), "hiddenSectionIds": []},
        "design": {"version": 1, "theme": plan["theme"], "sections": sections, "media": media},
        "localAssets": assets,
        "provenance": {
            "sourceId": source.source_id,
            "sourceSha256": source.source_sha256,
            "sourceWidth": source.width,
            "sourceHeight": source.height,
            "coordinateSystem": "EXIF_TRANSPOSED_NATIVE_PIXELS",
            "sourceExifOrientation": source.exif_orientation,
            "regions": records,
            "selection": "AUTOMATIC_VISION_PLAN",
            "humanReview": "PENDING",
            "promptVersion": PROMPT_VERSION,
            "model": MODEL,
            "warnings": copy.deepcopy(plan["warnings"]),
            "semanticCompleteness": "NOT_ESTABLISHED_BY_COMPILER",
        },
    }

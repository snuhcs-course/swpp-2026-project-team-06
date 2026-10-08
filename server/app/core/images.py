"""비공개 사진 검사(contracts-1.2 6장). 실제 형식을 확인하고 EXIF·메타데이터를 지운다.

JPEG·PNG·WebP만 받는다. 선언한 형식과 파일 내용이 다르면 거절한다.
"""

import struct

from app.core.errors import invalid

MAX_BYTES = 10 * 1024 * 1024
ALLOWED = ("image/jpeg", "image/png", "image/webp")
_PNG_KEEP = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS"}


def _jpeg(data: bytes) -> bytes:
    out = bytearray(data[:2])
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            raise invalid({"file": "손상된 JPEG예요"})
        marker = data[i + 1]
        if marker == 0xDA:  # 스캔 시작: 나머지는 이미지 데이터
            out += data[i:]
            return bytes(out)
        length = int.from_bytes(data[i + 2 : i + 4], "big")
        if length < 2 or i + length + 2 > len(data):
            raise invalid({"file": "손상된 JPEG예요"})
        # APP0~APP15(EXIF·XMP 등)와 주석(COM)은 버린다
        if not (0xE0 <= marker <= 0xEF) and marker != 0xFE:
            out += data[i : i + length + 2]
        i += length + 2
    raise invalid({"file": "손상된 JPEG예요"})


def _png(data: bytes) -> bytes:
    out = bytearray(data[:8])
    i = 8
    while i + 12 <= len(data):
        (length,) = struct.unpack(">I", data[i : i + 4])
        kind = data[i + 4 : i + 8]
        end = i + length + 12
        if end > len(data):
            raise invalid({"file": "손상된 PNG예요"})
        if kind in _PNG_KEEP:
            out += data[i:end]
        i = end
    return bytes(out)


def _webp(data: bytes) -> bytes:
    out = bytearray(data[:12])
    i = 12
    while i + 8 <= len(data):
        kind = data[i : i + 4]
        (length,) = struct.unpack("<I", data[i + 4 : i + 8])
        end = i + 8 + length + (length % 2)
        if end > len(data):
            raise invalid({"file": "손상된 WebP예요"})
        if kind not in (b"EXIF", b"XMP "):
            chunk = bytearray(data[i:end])
            if kind == b"VP8X":
                chunk[8] &= ~0x0C  # EXIF·XMP 표시 비트를 끈다
            out += chunk
        i = end
    out[4:8] = struct.pack("<I", len(out) - 8)
    return bytes(out)


def sniff(data: bytes) -> str | None:
    if data[:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) > 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def sanitize(data: bytes, declared: str | None) -> tuple[str, bytes]:
    """(실제 형식, 메타데이터를 지운 바이트). 10MB 초과·형식 불일치는 400."""
    if len(data) > MAX_BYTES:
        raise invalid({"file": "사진 한 장은 10MB까지예요"})
    mime = sniff(data)
    if mime is None or (declared and declared != mime):
        raise invalid({"file": "JPEG·PNG·WebP 사진을 골라 주세요"})
    cleaned = {"image/jpeg": _jpeg, "image/png": _png, "image/webp": _webp}[mime](data)
    return mime, cleaned

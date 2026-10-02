"""Remove PNG textual metadata without decoding or re-encoding image data.

Blender's render stamps can include the local .blend filename. This portable
standard-library helper removes only tEXt, zTXt and iTXt chunks. Every other
chunk, including its original CRC, remains byte-for-byte unchanged.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import tempfile
import zlib

SIGNATURE = b"\x89PNG\r\n\x1a\n"
TEXT_CHUNKS = frozenset((b"tEXt", b"zTXt", b"iTXt"))
PERSONAL_PATH = re.compile(rb"(?i)(?:[a-z]:[\\/]+users[\\/]+|/users/|/home/|file://)")


def png_chunks(data: bytes) -> list[tuple[bytes, bytes, bytes]]:
    """Validate complete chunk framing and CRCs before modifying any file."""
    if not data.startswith(SIGNATURE):
        raise ValueError("Not a PNG file")
    chunks, offset = [], len(SIGNATURE)
    while offset < len(data):
        if len(data) - offset < 12:
            raise ValueError("Truncated PNG chunk header")
        length, = struct.unpack_from(">I", data, offset)
        end = offset + length + 12
        if end > len(data):
            raise ValueError("Truncated PNG chunk payload")
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:end - 4]
        crc, = struct.unpack_from(">I", data, end - 4)
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != crc:
            raise ValueError("PNG chunk CRC mismatch")
        chunks.append((kind, payload, data[offset:end]))
        offset = end
        if kind == b"IEND":
            if payload or offset != len(data):
                raise ValueError("PNG has invalid IEND or trailing data")
            break
    if not chunks or chunks[0][0] != b"IHDR" or len(chunks[0][1]) != 13:
        raise ValueError("PNG lacks its leading image header")
    if chunks[-1][0] != b"IEND" or not any(kind == b"IDAT" for kind, _, _ in chunks):
        raise ValueError("PNG lacks image data or its end marker")
    return chunks


def textual_payload(kind: bytes, payload: bytes) -> bytes:
    """Decode textual wrappers for a path-count audit, without reporting values."""
    try:
        if kind == b"zTXt":
            _, compressed = payload.split(b"\x00", 1)
            return zlib.decompress(compressed[1:]) if compressed[:1] == b"\x00" else payload
        if kind == b"iTXt":
            _, rest = payload.split(b"\x00", 1)
            flag, method = rest[:2]
            _, _, text = rest[2:].split(b"\x00", 2)
            return zlib.decompress(text) if flag == 1 and method == 0 else text
    except (ValueError, zlib.error):
        # Invalid text is still removed; a text decoder cannot affect pixels.
        return payload
    return payload


def private_path_count(chunks: list[tuple[bytes, bytes, bytes]]) -> int:
    return sum(bool(PERSONAL_PATH.search(textual_payload(kind, payload)))
               for kind, payload, _ in chunks if kind != b"IDAT")


def chunk_hash(chunks: list[tuple[bytes, bytes, bytes]], predicate) -> str:
    return hashlib.sha256(b"".join(raw for kind, _, raw in chunks if predicate(kind))).hexdigest()


def strip_text_metadata(file: str | Path, *, check_only: bool = False) -> dict:
    """Sanitize atomically and return verification hashes; pixels never decode."""
    file = Path(file)
    original = file.read_bytes()
    before = png_chunks(original)
    kept = [chunk for chunk in before if chunk[0] not in TEXT_CHUNKS]
    cleaned = SIGNATURE + b"".join(raw for _, _, raw in kept)
    after = png_chunks(cleaned)
    removed = [chunk for chunk in before if chunk[0] in TEXT_CHUNKS]
    idat = lambda kind: kind == b"IDAT"
    critical = lambda kind: not kind[0] & 32
    retained = lambda kind: kind not in TEXT_CHUNKS
    report = {
        "file": file.as_posix(), "changed": bool(removed),
        "removedTextChunks": len(removed),
        "removedChunkTypes": {kind.decode("ascii"): sum(item[0] == kind for item in removed)
                              for kind in sorted(TEXT_CHUNKS) if any(item[0] == kind for item in removed)},
        "removedBytes": len(original) - len(cleaned),
        "personalPathChunksBefore": private_path_count(before),
        "personalPathChunksAfter": private_path_count(after),
        "beforeSha256": hashlib.sha256(original).hexdigest(),
        "afterSha256": hashlib.sha256(cleaned).hexdigest(),
        "idatBeforeSha256": chunk_hash(before, idat), "idatAfterSha256": chunk_hash(after, idat),
        "criticalBeforeSha256": chunk_hash(before, critical), "criticalAfterSha256": chunk_hash(after, critical),
        "retainedBeforeSha256": chunk_hash(before, retained), "retainedAfterSha256": chunk_hash(after, retained),
        "allRetainedChunksIdentical": kept == after,
    }
    if not report["allRetainedChunksIdentical"] or report["idatBeforeSha256"] != report["idatAfterSha256"] or report["criticalBeforeSha256"] != report["criticalAfterSha256"]:
        raise ValueError("PNG image-preservation check failed")
    if removed and not check_only:
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=file.parent, prefix=file.name + ".", suffix=".sanitizing", delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(cleaned)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, file)
        finally:
            if temporary and temporary.exists():
                temporary.unlink()
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", type=Path, nargs="+", help="PNG files or source-asset folders")
    parser.add_argument("--check", action="store_true", help="Audit without writing; fail if text chunks remain")
    parser.add_argument("--audit", type=Path, help="Save chunk and image-preservation receipts")
    args = parser.parse_args()
    files = sorted({file for candidate in args.paths for file in
                    (candidate.rglob("*.png") if candidate.is_dir() else [candidate])})
    reports = [strip_text_metadata(file, check_only=args.check) for file in files]
    report = {"files": len(reports), "changedFiles": sum(item["changed"] for item in reports),
              "removedTextChunks": sum(item["removedTextChunks"] for item in reports),
              "personalPathChunksBefore": sum(item["personalPathChunksBefore"] for item in reports),
              "personalPathChunksAfter": sum(item["personalPathChunksAfter"] for item in reports),
              "allImageAndRetainedHashesUnchanged": all(item["allRetainedChunksIdentical"] and
                  item["idatBeforeSha256"] == item["idatAfterSha256"] and
                  item["criticalBeforeSha256"] == item["criticalAfterSha256"] and
                  item["retainedBeforeSha256"] == item["retainedAfterSha256"] for item in reports),
              "checkOnly": args.check, "assets": reports}
    if args.audit:
        args.audit.parent.mkdir(parents=True, exist_ok=True)
        args.audit.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "assets"}))
    return int(args.check and report["changedFiles"] > 0 or report["personalPathChunksAfter"] > 0)


if __name__ == "__main__":
    raise SystemExit(main())

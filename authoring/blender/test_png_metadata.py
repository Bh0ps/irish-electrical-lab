"""Image-preserving metadata sanitizer regressions (Python standard library)."""
import binascii
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

from png_metadata import SIGNATURE, png_chunks, strip_text_metadata


def chunk(kind, payload):
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", binascii.crc32(kind + payload) & 0xFFFFFFFF)


def fixture():
    return SIGNATURE + b"".join([
        chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)),
        chunk(b"sRGB", b"\x00"), chunk(b"gAMA", struct.pack(">I", 45455)),
        chunk(b"pHYs", struct.pack(">IIB", 3780, 3780, 1)),
        chunk(b"tEXt", b"File\x00C:/Users/Example/private/model.blend"),
        chunk(b"zTXt", b"Source\x00\x00" + zlib.compress(b"/home/example/model.blend")),
        chunk(b"iTXt", b"Details\x00\x01\x00en\x00Description\x00" + zlib.compress(b"/Users/example/model.blend")),
        chunk(b"IDAT", zlib.compress(b"\x00\x12\x34\x56\xff")),
        chunk(b"tEXt", b"Software\x00Original fixture"), chunk(b"IEND", b""),
    ])


class PngMetadataTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.file = Path(self.folder.name) / "fixture.png"
        self.original = fixture()
        self.file.write_bytes(self.original)

    def test_removes_all_three_text_types_and_preserves_every_other_chunk(self):
        report = strip_text_metadata(self.file)
        self.assertEqual(report["removedTextChunks"], 4)
        self.assertEqual(report["removedChunkTypes"], {"iTXt": 1, "tEXt": 2, "zTXt": 1})
        self.assertEqual(report["personalPathChunksBefore"], 3)
        self.assertEqual(report["personalPathChunksAfter"], 0)
        self.assertEqual(png_chunks(self.file.read_bytes()), [c for c in png_chunks(self.original) if c[0] not in (b"tEXt", b"zTXt", b"iTXt")])
        for kind in ("idat", "critical", "retained"):
            self.assertEqual(report[kind + "BeforeSha256"], report[kind + "AfterSha256"])

    def test_idempotent_second_pass_does_not_write_or_change_bytes(self):
        strip_text_metadata(self.file)
        before = self.file.read_bytes(), self.file.stat().st_mtime_ns
        self.assertFalse(strip_text_metadata(self.file)["changed"])
        self.assertEqual((self.file.read_bytes(), self.file.stat().st_mtime_ns), before)

    def test_check_only_reports_paths_without_mutating_the_input(self):
        self.assertTrue(strip_text_metadata(self.file, check_only=True)["changed"])
        self.assertEqual(self.file.read_bytes(), self.original)

    def test_rejects_corrupt_crc_without_overwriting_any_bytes(self):
        corrupted = bytearray(self.original); corrupted[30] ^= 1
        self.file.write_bytes(corrupted)
        with self.assertRaisesRegex(ValueError, "CRC"):
            strip_text_metadata(self.file)
        self.assertEqual(self.file.read_bytes(), corrupted)

    def test_rejects_truncated_and_appended_data_without_mutation(self):
        for invalid in (self.original[:-3], self.original + b"private trailing data", b"not a PNG"):
            with self.subTest(input_bytes=len(invalid)):
                self.file.write_bytes(invalid)
                with self.assertRaises(ValueError):
                    strip_text_metadata(self.file)
                self.assertEqual(self.file.read_bytes(), invalid)


if __name__ == "__main__":
    unittest.main()

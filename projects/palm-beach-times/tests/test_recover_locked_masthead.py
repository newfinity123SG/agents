import base64
import hashlib
import struct
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from recover_locked_masthead import recover

class MastheadRecoveryTests(unittest.TestCase):
    def test_exact_bytes_preserved(self):
        original=(b"\x89PNG\r\n\x1a\n"+b"\x00\x00\x00\x0dIHDR"+
                  struct.pack(">II",2048,520)+bytes([8,6,0,0,0])+b"synthetic bytes")
        src="data:image/png;base64,"+base64.b64encode(original).decode()
        html='<img data-masthead-source="locked-pbt-artwork" src="'+src+'">'
        actual,meta=recover(html)
        self.assertEqual(actual,original)
        self.assertEqual(meta["sha256"],hashlib.sha256(original).hexdigest())

    def test_missing_locked_masthead_rejected(self):
        with self.assertRaisesRegex(ValueError,"exactly one"):
            recover("<html><body></body></html>")

    def test_multiple_mastheads_rejected(self):
        with self.assertRaisesRegex(ValueError,"exactly one"):
            recover('<img data-masthead-source="locked-pbt-artwork"><img data-masthead-source="locked-pbt-artwork">')

if __name__=="__main__":
    unittest.main()

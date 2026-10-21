import tempfile
import unittest
from pathlib import Path
from scripts.verify_visual_assets import validate_masthead, validate_daily_comic

class VisualAssetGate(unittest.TestCase):
 def test_wrong_masthead_hash_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/"palm-beach-times-masthead.png";p.write_bytes(b"not approved artwork")
   with self.assertRaisesRegex(ValueError,"approved Oct 16"):validate_masthead(p)
 def test_reused_comic_date_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/"comic-2026-10-18.png";p.write_bytes(b"old comic")
   with self.assertRaisesRegex(ValueError,"edition date"):
    validate_daily_comic(p,"2026-10-19","Story","Caption","Alt")

if __name__=="__main__":unittest.main()

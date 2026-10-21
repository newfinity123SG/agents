import tempfile
import unittest
from pathlib import Path
from scripts.edition_checkpoint import create_checkpoint,verify_checkpoint,write_checkpoint

class CheckpointTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name)
  self.paths={}
  for name in ("html","comic","market_input","masthead"):
   p=self.base/(name+".bin");p.write_bytes(("real-"+name).encode());self.paths[name]=p
 def tearDown(self):self.tmp.cleanup()
 def test_round_trip(self):
  c=create_checkpoint("2026-10-21",self.paths)
  self.assertTrue(verify_checkpoint(c,self.paths,"2026-10-21"))
  self.assertFalse(c["storageVerified"])
  write_checkpoint(c,self.base/"checkpoint.json")
  with self.assertRaisesRegex(ValueError,"overwrite"):write_checkpoint(c,self.base/"checkpoint.json")
 def test_wrong_date(self):
  c=create_checkpoint("2026-10-21",self.paths)
  with self.assertRaisesRegex(ValueError,"Wrong edition"):verify_checkpoint(c,self.paths,"2026-10-20")
 def test_mutated_asset(self):
  c=create_checkpoint("2026-10-21",self.paths)
  self.paths["comic"].write_bytes(b"replacement")
  with self.assertRaisesRegex(ValueError,"comic"):verify_checkpoint(c,self.paths,"2026-10-21")
 def test_missing_asset(self):
  c=create_checkpoint("2026-10-21",self.paths)
  self.paths["market_input"].unlink()
  with self.assertRaises(FileNotFoundError):verify_checkpoint(c,self.paths,"2026-10-21")

if __name__=="__main__":unittest.main()

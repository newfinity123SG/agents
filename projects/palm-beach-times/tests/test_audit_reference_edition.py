import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from audit_reference_edition import audit

class ReferenceAuditTests(unittest.TestCase):
    def test_audit_does_not_infer_publishing_readiness(self):
        raw=b'<html data-layout="pbt-broadsheet-v6" data-skill-build="pbt-v6.0"><section id="comic"></section><img data-masthead-source="locked-pbt-artwork" src="data:image/png;base64,AAAA"></html>'
        result=audit(raw)
        self.assertTrue(result["layout_v6"])
        self.assertEqual(result["locked_masthead_count"],1)
        self.assertEqual(result["embedded_png_count"],1)
        self.assertFalse(result["is_publish_ready"])
        self.assertEqual(result["edition_date_stamps"],[])

if __name__=="__main__":unittest.main()

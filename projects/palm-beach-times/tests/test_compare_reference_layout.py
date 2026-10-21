import base64
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from compare_reference_layout import compare

def html(image=b"png",section="news",css="body{margin:0}"):
    im=base64.b64encode(image).decode()
    return ('<html data-layout="pbt-broadsheet-v6" data-skill-build="pbt-v6.0"><head><style>'+css+
            '</style></head><body><img data-masthead-source="locked-pbt-artwork" src="data:image/png;base64,'+
            im+'"><section id="'+section+'"></section></body></html>').encode()

class CompareReferenceTests(unittest.TestCase):
    def test_identical_layout_passes(self):
        self.assertTrue(compare(html(),html())["passed"])
    def test_masthead_change_fails(self):
        self.assertIn("Locked masthead bytes changed",compare(html(),html(image=b"other"))["differences"])
    def test_css_change_fails(self):
        self.assertIn("Inline stylesheet changed",compare(html(),html(css="body{margin:1px}"))["differences"])
    def test_sections_change_fails(self):
        self.assertIn("Section order or IDs changed",compare(html(),html(section="different"))["differences"])

if __name__=="__main__":unittest.main()

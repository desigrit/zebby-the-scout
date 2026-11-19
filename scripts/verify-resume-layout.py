import json
from pathlib import Path
import pdfplumber

root = Path("qa-output/tailored-resume")
report = {}
for filename in ["pdf-reference.pdf", "pdf-tailored.pdf", "word-reference.pdf", "word-tailored.pdf"]:
    with pdfplumber.open(root / filename) as document:
        report[filename] = {"pages": len(document.pages)}
        for i, page in enumerate(document.pages):
            page.to_image(resolution=115).save(root / f"{Path(filename).stem}-{i + 1}.png")
            assert all(c["x0"] >= -1 and c["x1"] <= page.width + 1 for c in page.chars), filename
        text = " ".join(p.extract_text() or "" for p in document.pages)
        assert "Alex Morgan" in text
        assert "18%" in text
assert report["pdf-reference.pdf"]["pages"] == report["pdf-tailored.pdf"]["pages"] == 2
assert report["word-reference.pdf"]["pages"] == report["word-tailored.pdf"]["pages"] == 1
converted = root / "converted" / "pdf-tailored.pdf"
if converted.exists():
    with pdfplumber.open(converted) as document:
        assert len(document.pages) == 2, "The Word copy of a PDF retains both pages."
        text = " ".join(p.extract_text() or "" for p in document.pages)
        for expected in ["Alex Morgan", "EDUCATION", "18%", "Led a weekly"]:
            assert expected in text, expected
        for i, page in enumerate(document.pages):
            page.to_image(resolution=115).save(root / f"pdf-as-word-{i + 1}.png")
    report["pdf-as-word"] = {"pages": 2}
(root / "layout-verification.json").write_text(json.dumps(report, indent=2))
print("Reference layout and exported text verified.")

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
        assert "18%" in text, filename
        if filename == "pdf-tailored.pdf":
            assert "Led a weekly measurement practice" in text, "Edited PDF keeps searchable spaces."
            # Text extraction alone also succeeds for broken embedded fonts.
            # Check that the edited line actually paints visible glyphs.
            pixels = document.pages[0].crop((40, 231, 395, 249)).to_image(resolution=144).original.convert("L")
            assert sum(p < 180 for p in pixels.getdata()) > 700, "Edited PDF text must be visible."
        if filename.startswith("word-"):
            assert any(r["width"] > 400 and r["height"] <= 2 for r in document.pages[0].rects + document.pages[0].lines), "Word section rules remain visible."
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
        assert any("Carlito" in c["fontname"] or "Calibri" in c["fontname"] for c in document.pages[0].chars), "The Word copy retains the source font family."
    report["pdf-as-word"] = {"pages": 2}
(root / "layout-verification.json").write_text(json.dumps(report, indent=2))
print("Reference layout and exported text verified.")

import { readFile } from "node:fs/promises";
import { PDFDocument, rgb, PDFName, PDFString } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import { resumeDocx } from "../../desktop/tailored-resume.ts";

export async function referencePdf() {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(await readFile(new URL("../../public/resume-fonts/Carlito-Regular.ttf", import.meta.url)), { features: { liga: false, clig: false } });
  const bold = await pdf.embedFont(await readFile(new URL("../../public/resume-fonts/Carlito-Bold.ttf", import.meta.url)), { features: { liga: false, clig: false } });
  const italic = await pdf.embedFont(await readFile(new URL("../../public/resume-fonts/Carlito-Italic.ttf", import.meta.url)), { features: { liga: false, clig: false } });
  const page = pdf.addPage([612, 792]);
  const text = (value, x, y, font = regular, size = 10) => page.drawText(value, { x, y, font, size });
  text("Alex Morgan", 265, 755, bold, 14);
  text("alex@example.com  |  Seattle, WA", 237, 736);
  text("LinkedIn", 305, 722);
  page.node.set(PDFName.of("Annots"), pdf.context.obj([pdf.context.register(pdf.context.obj({
    Type: "Annot", Subtype: "Link", Rect: [305, 720, 342, 733], Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of("https://example.com/alex") },
  }))]));
  text("Product manager who connects customer research with measurable product outcomes.", 30, 690);
  text("Experienced in discovery, experimentation, and cross-functional delivery.", 30, 677);
  text("WORK EXPERIENCE", 260, 645, bold);
  page.drawRectangle({ x: 30, y: 636, width: 552, height: .5, color: rgb(0, 0, 0) });
  text("EXAMPLE COMPANY", 30, 620, bold);
  text("Senior Product Manager", 30, 604, bold);
  text("Seattle, WA | 2022 - Present", 470, 604, bold);
  text("Led discovery and cross-functional delivery for a growing customer platform.", 30, 585, italic);
  text("•", 30, 564);
  const achievement = "Led customer research and partnered with engineering to improve activation by ";
  text(achievement, 42, 564);
  text("18%.", 42 + regular.widthOfTextAtSize(achievement, 10), 564, bold);
  text("•", 30, 548);
  text("Built a weekly measurement practice so the team could compare customer outcomes.", 42, 548);
  const second = pdf.addPage([612, 792]);
  second.drawText("EDUCATION", { x: 275, y: 750, font: bold, size: 10 });
  second.drawText("Example University | B.S. Computer Science | 2015 - 2019", { x: 30, y: 730, font: regular, size: 10 });
  second.drawText("SKILLS", { x: 30, y: 695, font: bold, size: 10 });
  second.drawText("Customer discovery, product strategy, experimentation, SQL, cross-functional leadership", { x: 30, y: 675, font: regular, size: 10 });
  return pdf.save();
}

export async function referenceWord() {
  const zip = await JSZip.loadAsync(await resumeDocx([]));
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
  <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="30"/></w:rPr><w:t>Alex Morgan</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>alex@example.com | Seattle, WA</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="160"/><w:pBdr><w:bottom w:val="single" w:sz="4"/></w:pBdr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>EXPERIENCE</w:t></w:r></w:p>
    <w:tbl><w:tblPr><w:tblW w:w="10640" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="6640"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr>
      <w:tc><w:tcPr><w:tcW w:w="6640" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Product Manager | Example Company</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>2022 - Present</w:t></w:r></w:p></w:tc>
    </w:tr></w:tbl>
    <w:p><w:pPr><w:ind w:left="240" w:hanging="180"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>
      <w:r><w:t xml:space="preserve">• Led customer research and partnered with engineering to improve activation by </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>18%.</w:t></w:r>
    </w:p>
    <w:p><w:hyperlink r:id="profile"><w:r><w:rPr><w:color w:val="0066CC"/><w:u w:val="single"/></w:rPr><w:t>linkedin.com/in/alex</w:t></w:r></w:hyperlink></w:p>
    <w:sectPr><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="600" w:right="600" w:bottom="600" w:left="600" w:header="0" w:footer="250"/></w:sectPr>
  </w:body></w:document>`);
  zip.file("word/styles.xml", '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>');
  zip.file("word/footer1.xml", '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Portfolio available on request</w:t></w:r></w:p></w:ftr>');
  zip.file("word/_rels/document.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="footer" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="profile" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/alex" TargetMode="External"/></Relationships>');
  const types = await zip.file("[Content_Types].xml").async("string");
  zip.file("[Content_Types].xml", types.replace("</Types>", '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'));
  return zip.generateAsync({ type: "uint8array" });
}

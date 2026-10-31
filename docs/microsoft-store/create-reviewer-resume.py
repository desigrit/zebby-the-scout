from pathlib import Path
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

output = Path(sys.argv[1])
output.parent.mkdir(parents=True, exist_ok=True)
ink = colors.HexColor("#302c29")
muted = colors.HexColor("#71675f")
accent = colors.HexColor("#a64a34")
styles = {
    "name": ParagraphStyle("name", fontName="Helvetica-Bold", fontSize=28, leading=34, textColor=ink, spaceAfter=5),
    "title": ParagraphStyle("title", fontName="Helvetica", fontSize=12, leading=18, textColor=accent, spaceAfter=18),
    "section": ParagraphStyle("section", fontName="Helvetica-Bold", fontSize=11, leading=16, textColor=accent, spaceBefore=18, spaceAfter=8),
    "role": ParagraphStyle("role", fontName="Helvetica-Bold", fontSize=11, leading=16, textColor=ink, spaceAfter=3),
    "meta": ParagraphStyle("meta", fontName="Helvetica", fontSize=9, leading=14, textColor=muted, spaceAfter=8),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=10, leading=15, textColor=ink, spaceAfter=7),
    "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=10, leading=15, textColor=ink, leftIndent=10, firstLineIndent=-10, spaceAfter=6),
}
story = []
def p(text, kind="body"):
    story.append(Paragraph(text, styles[kind]))

p("Alex Morgan", "name")
p("Product Manager | Seattle, WA", "title")
p("Product manager with seven years of experience building consumer products. I connect customer research, product strategy, and thoughtful experimentation to help teams deliver useful experiences and measurable growth.")
p("Experience", "section")
p("Senior Product Manager | Meridian", "role")
p("2022 - Present", "meta")
p("- Led customer discovery for a consumer search experience, combining interviews, usability studies, and product analytics to shape the roadmap.", "bullet")
p("- Partnered with design and engineering to launch improved discovery and recommendation flows across web and mobile.", "bullet")
p("- Defined success metrics and ran controlled experiments that improved product activation by 18%.", "bullet")
p("- Aligned a cross-functional team around a quarterly strategy, clear priorities, and regular customer feedback.", "bullet")
story.append(Spacer(1, 9))
p("Product Manager | Fieldwork", "role")
p("2019 - 2022", "meta")
p("- Took a new consumer onboarding experience from discovery through launch with a team of designers, researchers, and engineers.", "bullet")
p("- Used cohort analysis and qualitative research to identify friction and prioritize improvements to retention.", "bullet")
p("- Wrote product briefs and decision documents that connected customer problems, delivery tradeoffs, and business outcomes.", "bullet")
p("Skills", "section")
p("Product strategy, customer discovery, experimentation, roadmap prioritization, product analytics, cross-functional leadership, search and recommendations, written communication.")
p("Education", "section")
p("BSc, Human-Computer Interaction")

doc = SimpleDocTemplate(str(output), pagesize=letter, rightMargin=54, leftMargin=54, topMargin=48, bottomMargin=45,
                        title="Alex Morgan - Product Manager", author="", subject="Product management resume")
doc.build(story)
print(output)

#!/usr/bin/env python3
"""Generate printable project briefs from the website content."""
import argparse
import json
import os
from pathlib import Path
import subprocess
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

BASE = Path(__file__).resolve().parents[1]
DEFAULT_JS = BASE / 'public/project-briefs.js'
DEFAULT_JSON = None
FONT_DIR = Path('/usr/share/fonts/truetype/dejavu')
pdfmetrics.registerFont(TTFont('Schurr', str(FONT_DIR / 'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('SchurrBold', str(FONT_DIR / 'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFontFamily('Schurr', normal='Schurr', bold='SchurrBold')

W, H = A4
M = 48
CW = W - 2 * M
INK = colors.HexColor('#251b34')
PURPLE = colors.HexColor('#7651bb')
MUTED = colors.HexColor('#5e5868')
PALE = colors.HexColor('#f3eff9')
LINE = colors.HexColor('#ded7e8')
PHONE = '(985) 232-8337'
EMAIL = 'gavin@schurrautomations.com'
SITE = 'schurrautomations.com'
CONTEXT = 'This brief outlines a proposed engagement. Scope, fees, and delivery dates are confirmed after reviewing your requirements and existing systems.'
ORDER = ['calls', 'leads', 'time', 'growth', 'website', 'reviews', 'marketing', 'brain', 'audit', 'coding']

def clean(text):
    return str(text).replace('\u2014', '-').replace('\u2013', '-').replace('\u2011', '-')

def style(name='body', size=10.2, leading=14.3, color=INK, bold=False):
    return ParagraphStyle(name, fontName='SchurrBold' if bold else 'Schurr', fontSize=size,
                          leading=leading, textColor=color, alignment=TA_LEFT,
                          spaceBefore=0, spaceAfter=0, allowWidows=0, allowOrphans=0)

def para(c, text, x, y, width, size=10.2, leading=14.3, color=INK, bold=False):
    p = Paragraph(escape(clean(text)), style(size=size, leading=leading, color=color, bold=bold))
    _, height = p.wrap(width, H)
    p.drawOn(c, x, y - height)
    return y - height

def section(c, label, items, y, *, x=M, width=CW, numbered=False, compact=False):
    y -= 7
    y = para(c, label.upper(), x, y, width, size=8.3, leading=11, color=PURPLE, bold=True)
    y -= 8
    if isinstance(items, str):
        return para(c, items, x, y, width) - 7
    for i, item in enumerate(items):
        indent = 21 if numbered else 12
        if numbered:
            para(c, f'{i+1:02}', x, y, indent, size=8.5, leading=14.3, color=PURPLE, bold=True)
        else:
            c.setFillColor(PURPLE)
            c.circle(x + 2, y - 6.6, 1.5, stroke=0, fill=1)
        y = para(c, item, x + indent, y, width - indent, size=9.8 if compact else 10.2,
                 leading=13.8 if compact else 14.3)
        y -= 4 if compact else 5
    return y - 4

def chrome(c, page, key):
    c.setFillColor(PURPLE)
    c.rect(0, H - 7, W, 7, stroke=0, fill=1)
    c.setFont('SchurrBold', 11)
    c.setFillColor(INK)
    c.drawString(M, H - 35, 'SCHURR AUTOMATIONS')
    c.setFont('Schurr', 8.3)
    c.setFillColor(MUTED)
    c.drawRightString(W - M, H - 35, 'PROJECT PLANNING BRIEF')
    c.setStrokeColor(LINE)
    c.setLineWidth(.6)
    c.line(M, 48, W - M, 48)
    c.setFont('SchurrBold', 8.5)
    c.setFillColor(INK)
    contact = f'Gavin direct  |  {PHONE}'
    c.drawString(M, 32, contact)
    c.linkURL('tel:+19852328337', (M, 27, M + pdfmetrics.stringWidth(contact, 'SchurrBold', 8.5), 42), relative=0)
    c.setFont('Schurr', 8.2)
    c.setFillColor(MUTED)
    c.drawRightString(W - M, 32, f'{page} / 2')
    c.setFont('Schurr', 7.5)
    c.drawString(M, 18, SITE)
    c.linkURL('https://' + SITE, (M, 13, M + pdfmetrics.stringWidth(SITE, 'Schurr', 7.5), 25), relative=0)
    c.drawRightString(W - M, 18, EMAIL)
    c.linkURL('mailto:' + EMAIL, (W - M - pdfmetrics.stringWidth(EMAIL, 'Schurr', 7.5), 13, W - M, 25), relative=0)

def panel(c, text, y):
    p = Paragraph(escape(text), style(size=9.1, leading=13, color=MUTED))
    _, height = p.wrap(CW - 24, H)
    c.setFillColor(PALE)
    c.roundRect(M, y - height - 20, CW, height + 20, 5, stroke=0, fill=1)
    p.drawOn(c, M + 12, y - height - 10)
    return y - height - 33

def render_brief(key, brief, out):
    c = canvas.Canvas(str(out), pagesize=A4, pageCompression=1)
    c.setTitle(brief['title'] + ' | Schurr Automations')
    c.setAuthor('Gavin Schurr, Schurr Automations')
    c.setSubject('Proposed project scope, requirements, acceptance criteria, and performance measures')
    bottoms = []
    chrome(c, 1, key)
    y = H - 65
    y = para(c, brief['title'], M, y, CW, size=25, leading=30, bold=True) - 10
    y = para(c, brief['text'], M, y, CW, size=10.8, leading=15.4, color=MUTED) - 15
    y = panel(c, CONTEXT, y)
    y = section(c, 'Business objective', brief['objective'], y)
    y = section(c, 'Proposed scope', brief['scope'], y)
    y = section(c, 'Client requirements', brief['inputs'], y)
    bottoms.append(round(y, 2))
    if y < 65:
        raise ValueError(f'{key}: page 1 content extends to {y:.1f}, below safe boundary')
    if y < 197:
        raise ValueError(f'{key}: page 1 needs more room above project details')
    para(c, 'PROJECT DETAILS', M, 179, CW, size=8.3, leading=11, color=PURPLE, bold=True)
    detail_width = (CW - 26) / 2
    for x, label, top in [(M, 'Business name', 153), (M + detail_width + 26, 'Contact name', 153),
                          (M, 'Current systems', 110), (M + detail_width + 26, 'Priority outcome', 110)]:
        para(c, label, x, top, detail_width, size=8.6, leading=12, color=MUTED)
        c.setStrokeColor(LINE)
        c.setLineWidth(.6)
        c.line(x, top - 25, x + detail_width, top - 25)
    c.showPage()
    chrome(c, 2, key)
    y = H - 65
    y = para(c, 'Implementation and review', M, y, CW, size=21, leading=27, bold=True) - 5
    y = para(c, brief['title'], M, y, CW, size=9.3, leading=13.5, color=MUTED) - 7
    y = section(c, 'Operational workflow', brief['workflow'], y, numbered=True, compact=True)
    y = section(c, 'Acceptance criteria', brief['acceptance'], y, compact=True)
    col_width = (CW - 26) / 2
    left_bottom = section(c, 'Performance measures', brief['metrics'], y, width=col_width, compact=True)
    right_bottom = section(c, 'Cost considerations', brief['costDrivers'], y, x=M + col_width + 26,
                           width=col_width, compact=True)
    y = min(left_bottom, right_bottom) - 1
    y = section(c, 'Discovery questions', brief['discovery'], y, numbered=True, compact=True)
    y -= 4
    y = para(c, 'Discuss the scope', M, y, CW, size=10.5, leading=14, color=PURPLE, bold=True) - 3
    y = para(c, 'Email ' + EMAIL + ' or call Gavin at ' + PHONE + '. Use this brief to discuss your systems, required changes, and goals.',
             M, y, CW, size=9.1, leading=13, color=MUTED) - 5
    y = para(c, 'Downloading this brief does not submit an inquiry or confirm a project.', M, y, CW,
             size=8.1, leading=11.5, color=MUTED)
    bottoms.append(round(y, 2))
    if y < 65:
        raise ValueError(f'{key}: page 2 content extends to {y:.1f}, below safe boundary')
    c.save()
    return bottoms

def load_briefs(js_path, json_path):
    node = os.environ.get('CODEX_PRIMARY_RUNTIME_NODE', 'node')
    code = 'const fs=require("fs"),vm=require("vm");const context={window:{}};vm.runInNewContext(fs.readFileSync(process.argv[1],"utf8"),context);process.stdout.write(JSON.stringify(context.window.SCHURR_PROJECT_BRIEFS));'
    current = json.loads(subprocess.check_output([node, '-e', code, str(js_path)], text=True))
    added = json.loads(json_path.read_text()) if json_path else current
    combined = {key: current[key] for key in ORDER[:4]}
    combined.update({key: added[key] for key in ORDER[4:]})
    return combined

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-js', type=Path, default=DEFAULT_JS)
    parser.add_argument('--additional-json', type=Path, default=DEFAULT_JSON)
    parser.add_argument('--output-dir', type=Path, default=BASE / 'public/briefs')
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    briefs = load_briefs(args.source_js, args.additional_json)
    manifest = {}
    for key, brief in briefs.items():
        output = args.output_dir / (key + '.pdf')
        manifest[key] = {'file': str(output), 'pages': 2, 'content_bottoms': render_brief(key, brief, output)}
    (args.output_dir / 'source-briefs.json').write_text(json.dumps(briefs, indent=2, ensure_ascii=False) + '\n')
    (args.output_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))

if __name__ == '__main__':
    main()

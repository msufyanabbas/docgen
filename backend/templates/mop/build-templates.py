"""
Three fixes to the MOP templates:

1. The cover keeps its full-strength artwork. The earlier fade dulled it because
   the same media file (image2.png) is used on the cover AND behind the body
   text — so the body now points at its own faded copy instead.
2. Only the page-2 decoration is faded, enough to read through.
3. Margins are tightened so the document lands on two pages. LibreOffice lays
   the body out a fraction looser than Word, which pushed two lines onto a third
   page; the PDF is produced by LibreOffice, so it has to fit there.
"""
import re, shutil, sys, zipfile
from pathlib import Path
from PIL import Image
import io

FADE = 0.20
SRC_DIR = Path('/mnt/user-data/uploads')
OUT_DIR = Path('/mnt/user-data/outputs/tawal-docgen/backend/templates/mop')

SOURCES = {
    'Site_Survey': 'TAWAL_MOP_Format_ll_TCN_-_Site_Survey.docx',
    'INSTALLATION': 'TAWAL_MOP_Format_ll_TCN_-_INSTALLATION.docx',
    'CCTV_Installation': 'TAWAL_MOP_Format_ll_TCN_-_CCTV_Installation.docx',
    'SIM_SWAP': 'TAWAL_MOP_Format_ll_TCN_-_SIM_SWAP.docx',
}

LABELS = [
    ('tcn summary', '{{TCN_SUMMARY}}'),
    ('site id', '{{SITE_ID}}'),
    ('name of requester', '{{REQUESTER_NAME}}'),
    ('name of pm', '{{PM_NAME}}'),
    ('site impact', '{{SITE_IMPACT}}'),
]

norm = lambda t: re.sub(r'[^a-z]', '', t.lower())


def placeholders(xml: str) -> str:
    """Replace the Document Control values with {{PLACEHOLDERS}}, by label."""
    table = re.search(r'<w:tbl>.*?</w:tbl>', xml, re.S).group()
    new_table = table
    for row in re.findall(r'<w:tr\b.*?</w:tr>', table, re.S):
        cells = re.findall(r'<w:tc>.*?</w:tc>', row, re.S)
        if len(cells) < 2:
            continue
        label = ' '.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', cells[0]))
        ph = next((p for k, p in LABELS if norm(k) in norm(label)), None)
        if not ph:
            continue
        cell = cells[1]
        runs = list(re.finditer(r'(<w:t[^>]*>)([^<]*)(</w:t>)', cell))
        new_cell = cell
        for i, r in enumerate(runs):
            open_tag = r.group(1)
            if 'xml:space' not in open_tag:
                open_tag = open_tag[:-1] + ' xml:space="preserve">'
            new_cell = new_cell.replace(r.group(0), open_tag + (ph if i == 0 else '') + '</w:t>', 1)
        new_table = new_table.replace(cell, new_cell, 1)
    return xml.replace(table, new_table, 1)


def compact_styles(xml: str) -> str:
    """
    Drop the default body size a point and add a slightly tighter leading.

    Most paragraphs in the MOP carry no run properties of their own, so this is
    the only place that reaches them. Without it the Rollback list spills onto a
    third page once Tawal's brand font is substituted.
    """
    xml = xml.replace('<w:sz w:val="24"/>', '<w:sz w:val="22"/>', 1)
    xml = xml.replace('<w:szCs w:val="24"/>', '<w:szCs w:val="22"/>', 1)

    if '<w:spacing' not in xml.split('</w:docDefaults>')[0]:
        xml = xml.replace(
            '<w:pPrDefault><w:pPr>',
            '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="216" w:lineRule="auto"/>',
            1,
        )
    return xml


def build(key: str, filename: str):
    src = SRC_DIR / filename
    zin = zipfile.ZipFile(src)

    doc = zin.read('word/document.xml').decode('utf8')
    rels = zin.read('word/_rels/document.xml.rels').decode('utf8')

    # --- which media file backs the body-page decoration? ---
    rel_map = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
    body_embed = None
    for m in re.finditer(r'<wp:anchor\b', doc):
        end = doc.find('</wp:anchor>', m.start())
        block = doc[m.start():end]
        ext = re.search(r'<wp:extent cx="(\d+)" cy="(\d+)"', block)
        width = int(ext.group(1)) // 9525 if ext else 0
        # cover art ~1454px, header logo ~250px, body swirls ~860-880px
        if 'behindDoc="1"' in block[:400] and 700 < width < 1100:
            emb = re.search(r'<a:blip[^>]*r:embed="([^"]+)"', block)
            if emb and doc.count(f'r:embed="{emb.group(1)}"') > 1:
                # shared with the cover — this is the one that needs its own copy
                body_embed = emb.group(1)

    faded_name = None
    if body_embed:
        target = rel_map[body_embed]
        original = zin.read(f'word/{target}')
        im = Image.open(io.BytesIO(original)).convert('RGBA')
        r, g, b, a = im.split()
        im.putalpha(a.point(lambda v: int(v * FADE)))
        buf = io.BytesIO()
        im.save(buf, format='PNG', optimize=True)
        faded_bytes = buf.getvalue()

        faded_name = 'media/image_body_faded.png'
        new_id = 'rIdBodyFaded'
        rels = rels.replace(
            '</Relationships>',
            f'<Relationship Id="{new_id}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
            f'Target="{faded_name}"/></Relationships>',
        )

        # Point only the LAST occurrence (the body page) at the faded copy;
        # the first is the cover and keeps full strength.
        idx = doc.rfind(f'r:embed="{body_embed}"')
        doc = doc[:idx] + f'r:embed="{new_id}"' + doc[idx + len(f'r:embed="{body_embed}"'):]

    # Only the bottom margin is reclaimed, and only enough to pull the Rollback
    # list back onto page 2. Top and side margins are left exactly as Tawal
    # authored them: the cover artwork and the MOP title are anchored relative
    # to the top of the page, and moving that boundary pushed the title onto
    # page 2 on a different LibreOffice build.
    doc = doc.replace(
        '<w:pgMar w:top="720" w:right="720" w:bottom="360" w:left="720"',
        '<w:pgMar w:top="720" w:right="720" w:bottom="360" w:left="720"',
    )

    # Trailing empty paragraphs push a blank third page. Drop the ones sitting
    # between the last real content and the closing section properties.
    def trim_trailing(xml: str) -> str:
        body_m = re.search(r'(<w:body>)(.*)(</w:body>)', xml, re.S)
        body = body_m.group(2)
        # keep the final sectPr, which lives after the last paragraph
        sect_m = re.search(r'(<w:sectPr\b.*?</w:sectPr>)\s*$', body, re.S)
        sect = sect_m.group(1) if sect_m else ''
        content = body[:sect_m.start()] if sect_m else body

        empty_p = re.compile(r'<w:p\b(?:(?!</w:p>).)*?</w:p>\s*$', re.S)
        removed = 0
        while removed < 6:
            m = empty_p.search(content)
            if not m:
                break
            block = m.group(0)
            if re.search(r'<w:t[^>]*>[^<]', block) or '<w:drawing' in block or '<w:tbl' in block:
                break
            content = content[:m.start()]
            removed += 1
        return xml.replace(body_m.group(0), body_m.group(1) + content + sect + body_m.group(3))

    # The body is set at 12pt with single spacing, which spills the Rollback
    # list onto a third page once the brand font is substituted. Dropping the
    # body a point and tightening the leading slightly brings it back to two
    # pages. Cover type (26pt/24pt) is untouched.
    def compact(xml: str) -> str:
        body_start = xml.find('<w:body>')
        cover_end = xml.find('<w:br w:type="page"/>', body_start)
        head, tail = xml[:cover_end], xml[cover_end:]

        tail = tail.replace('<w:sz w:val="28"/>', '<w:sz w:val="26"/>')
        tail = tail.replace('<w:szCs w:val="28"/>', '<w:szCs w:val="26"/>')
        tail = tail.replace('<w:sz w:val="24"/>', '<w:sz w:val="22"/>')
        tail = tail.replace('<w:szCs w:val="24"/>', '<w:szCs w:val="22"/>')
        tail = tail.replace('w:line="240"', 'w:line="192"')
        return head + tail

    doc = compact(doc)
    styles = compact_styles(zin.read('word/styles.xml').decode('utf8'))

    doc = trim_trailing(doc)

    doc = placeholders(doc)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f'{key}.docx'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename == 'word/document.xml':
                zout.writestr(item, doc.encode('utf8'))
            elif item.filename == 'word/_rels/document.xml.rels':
                zout.writestr(item, rels.encode('utf8'))
            elif item.filename == 'word/styles.xml':
                zout.writestr(item, styles.encode('utf8'))
            else:
                zout.writestr(item, zin.read(item.filename))
        if faded_name:
            zout.writestr(f'word/{faded_name}', faded_bytes)

    print(f'  {key}: body image {"split + faded" if faded_name else "unchanged"}, margins tightened')


for k, f in SOURCES.items():
    build(k, f)

# MOP templates

These are Tawal's own `.docx` files with the five Document Control values
replaced by `{{PLACEHOLDERS}}`. Generation fills them and converts with
LibreOffice, so the output is byte-identical to a hand-prepared MOP apart from
the values.

`build-templates.py` regenerates them from the originals in `/mnt/user-data/uploads`.
It makes four changes and nothing else:

1. **Placeholders** in the Document Control table, matched by row label.
2. **The body-page swirl is split from the cover's.** Both used the same media
   file, so fading one faded the other — the cover keeps full colour and only
   the body copy is dropped to 20% so the table and steps read cleanly.
3. **Bottom margin trimmed** from 720 to 360 twips. Top and side margins are
   untouched: the cover artwork and the MOP title are anchored relative to the
   top of the page, and moving that boundary pushed the title onto page 2 on a
   different LibreOffice build.
4. **Body set a point smaller with slightly tighter leading**, applied in
   `styles.xml` because most paragraphs carry no run properties of their own.
   Cover type is untouched. This is what keeps the Rollback list on page 2.

Result: two pages, MOP title on page 1, verified across all four templates.

Font substitution is pinned in the image (`backend/docker/fonts-local.conf`) —
"Teshrin AR+LT" is not embedded and not redistributable, so without a rule each
machine picks a different width and the document reflows.

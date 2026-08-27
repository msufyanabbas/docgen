# MOP sample

Produced by the real pipeline from Tawal's own template:

    backend/templates/mop/CCTV_Installation.docx   (your file, with placeholders)
      -> fillTemplate()   Document Control values substituted
      -> LibreOffice      .docx converted to .pdf

Values: Site ID ZMS009, Requester "Mohammed Alhaj", PM "Hazem A Najjar",
Site Impact "NO – No Impact".

Everything else — cover artwork, headers, footers, fonts — is byte-for-byte the
file you supplied, with one deliberate change: the swirl graphic that sits behind
the Document Control table and the procedure steps is faded to 20% opacity. At
full strength it made the text hard to read; the branding survives as a
watermark. See `mop/fade-background` notes in the README.

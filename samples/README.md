# Samples

`241-00-102R11_As-Built_BOQ_GENERATED.xlsx` was produced by running the real pipeline
end to end against your two source files:

  241-00-102R11_GCL-Signed.pdf  →  gcl.parser.ts
  UPL___reference__.xlsx        →  upl.parser.ts
                                →  BoqExcelGenerator

Totals it computed:

  Design QTY   13,761.00 SAR
  As-Built QTY 11,216.00 SAR   ← matches the signed 241-00-102R11_WO.pdf exactly

TAG # shows `N/A` throughout because that value lives in Tawal's asset registry,
not in the GCL — it is entered on the review screen.

`241-00-102R11_WO_GENERATED.xlsx` came from the same run through `WoExcelGenerator`.
Its Gross/Net cells are live formulas — verified in LibreOffice, 0 errors, both
resolving to 11,216.00.

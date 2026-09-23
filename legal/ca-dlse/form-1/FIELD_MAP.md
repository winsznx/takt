# DLSE WCA Form 1 (REV. 07/2025) field map

Source: `source.pdf` (sha256 `a782525b…267b`). The PDF is a real AcroForm with
250 fields across 3 pages, inspected with pdf-lib and cross-read with pdf.js.

Takt maps fields by widget position and the printed question beside them. The
internal AcroForm names are not reliable on this revision:

| Printed question | AcroForm field name | Note |
|---|---|---|
| "Is this claim related to your employer's wrongful classification of you as an independent contractor…?" (page 1, top) | `IS THIS CLAIM RELATED TO COVID-19?` | Name left over from an earlier revision. |
| 10. CELLPHONE | `OTHER PHONE` | |
| 13. Alternate contact name / 13a phone / 13b email | `ALT Contact` / `ALT PHONE` / `Email of alt` | |
| 20. Address where you worked, if different from Box 19 | `ADDRESS where you worked, if different from Box 16 …` | Box number in name is stale. |
| 26. Employer type, "I DON'T KNOW" | `undefined_10` (checkbox) | |
| 1. Public works project? | none | Question has no field. Takt's scope gate treats public works as unsupported. |

## What Takt fills

- Part 2 claimant identity and contact, Part 3 employer information.
- Part 4 date of hire, employment status, how wages were paid.
- Part 5 Q30 schedule regularity. The typical-week grid (Q31) is filled **only**
  for regular schedules. The form says not to fill it for irregular hours and to
  use DLSE Form 55 instead, which is what Takt does.
- Part 6 hourly / fixed / piece-rate / commission answers and hourly rate.
- Part 7 Q36 rows for regular wages and overtime wages (amount earned), subtotal,
  total amount paid, and grand total owed (subtotal minus total paid), which is
  the form's own arithmetic.

## What Takt never fills

- Signature, signature date, and the "Print Name" line under the signature.
  The worker signs.
- Office-use fields (taken by, case number, date filed).
- Penalty checkboxes (Q37) and claim rows Takt does not compute (meal/rest period,
  split shift, reporting time, commissions, vacation, expenses, deductions, sick
  leave, other).

Money is written as `1,234.56` right-aligned beside the printed `$`. Dates are
`mm/dd/yyyy`. Times on the typical-week grid are `h:mm` with the am/pm radio.

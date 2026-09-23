# DLSE Form 55 cell map

Source: `source.xls` (BIFF8 / Excel 97-2003, sha256 `a5be16bf…3bb5`). Only
`Sheet1` (A1:M29) carries the form; `Sheet2` and `Sheet3` are empty.

Form 55 is a **per-pay-period** computation sheet with 18 period rows. It has no
daily start or end time cells. Daily intervals are recorded in Takt's evidence
index and `calculation.csv`. The sheet header says to use a separate sheet for
each pay rate, so Takt produces one workbook per distinct hourly rate and at most
18 periods per workbook.

| Cell | Printed label | Takt value |
|---|---|---|
| C3 | Employer Name: (A3) | employer name as confirmed by the worker |
| H3 | Employee Name: (F3) | worker name |
| L3 | Case No.: (K3) | left blank (assigned by the Labor Commissioner) |
| B7–B24 | Pay period dates, from – to | `m/d/yy - m/d/yy` |
| C | Hourly rate | confirmed hourly rate |
| D | # of Reg. Hours | regular hours from confirmed work, 2 decimals |
| E / F | Overtime rate / # of O.T. hours | 1.5 × rate, overtime hours (only when non-zero) |
| G / H | Double time rate / # of double time hours | 2 × rate, double-time hours (only when non-zero) |
| I | $ Earned | exact calculation rounded to cents |
| J | $ Paid | wages paid per the confirmed paystub |
| K | $ Owed | earned minus paid |
| L / M | Rest / meal periods missed | left blank; meal and rest premiums are outside Takt's supported scope |
| D25, F25, H25, I25–M25 | SUM formulas | formulas kept; cached results updated to the exact sums |

"How often paid" (row 26–28) is left unmarked. The official sheet has option
labels but no cell per option to mark. Pay frequency is visible from the period
dates in column B.

## How the file is produced

Takt does not re-save the workbook through a spreadsheet library, because that
drops the official borders, merges, number formats, and print setup. It patches
the original `Workbook` stream record by record (`src/lib/forms/biff8.ts`):
blank cells become NUMBER or LABEL records that keep their original cell style,
cached formula results are updated, and the stream offsets in BOUNDSHEET, INDEX,
and DBCELL are recomputed. Tests assert that every non-cell record is identical
to the official file and that only mapped cells changed.

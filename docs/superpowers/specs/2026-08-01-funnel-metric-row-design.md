# Funnel Metric Row Design

## Goal

Make detailed funnel rows concise and consistently aligned at every supported
width. Each metric shows one value beneath a label, without repeating the
label's meaning in the value.

## Metric content

Non-completion stages show exactly three metrics:

| Label | Example value | Source |
| --- | --- | --- |
| Visitors | `10` | Stage visitor count |
| Continued | `20` | Continuation rate rounded to a whole number |
| Drop-off | `80` | Drop-off rate rounded to a whole number |

Values do not include `%`, `continued`, `dropped`, a numerator/denominator, or
a secondary line. Completion stages use the same three metrics as every other
row, so a completed journey renders `Continued` / `100` instead of a one-off
`Status` / `Completed` value.

Count values use compact notation with at most one useful decimal place:
`999`, `1K`, `1.2K`, `10K`, `100K`, and `1M`. Trailing `.0` is omitted. Rate
values remain whole numbers from `0` through `100` and do not use compact
notation.

## Layout

Every stage row uses the same explicit metric-column template. The stage
identity occupies the flexible leading area on wider screens, while Visitors,
Continued, and Drop-off occupy three equal-width columns. On narrow screens,
the identity remains above the metrics and the three metrics still use equal
columns. Content length therefore cannot move a column independently from one
row to another.

Numeric values use tabular figures. Long compact values stay on one line. The
existing card surfaces, stage icon, skipped count, and responsive stacking are
otherwise unchanged.

## Verification

Do not add literal-copy assertions for the presentational metric values. Run
the existing analytics dashboard journey, lint for the touched component, and
the project build. Visually inspect representative desktop and narrow
viewports to confirm the compact formatting and that metric columns remain
aligned between rows.

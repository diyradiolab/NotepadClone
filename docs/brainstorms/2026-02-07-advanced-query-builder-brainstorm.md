# Advanced SQL Query Builder

**Date:** 2026-02-07
**Status:** Brainstorm complete

## What We're Building

An advanced mode for the SQL query builder that adds GROUP BY, aggregate functions, HAVING, comparison operator dropdowns, and JOIN across open tabs — all within the existing grid pattern. CTEs remain text-only in the textarea.

A "Basic / Advanced" toggle switches between the current simple builder and the extended grid.

## Why This Approach

- **Dual mode** keeps the simple builder accessible for quick queries while exposing power features on demand.
- **Extended grid** (Approach A) is the most incremental path — adds columns to the existing row-based pattern rather than rearchitecting the UI.
- **CTEs as text-only** is pragmatic — visual CTE builders are complex to build and rarely better than just writing SQL.

## Key Decisions

1. **Dual mode toggle**: Basic (current) vs Advanced, toggle button in builder header
2. **Advanced grid columns** (hidden in basic mode):
   - **Aggregate dropdown**: NONE, COUNT, SUM, AVG, MIN, MAX
   - **Group By checkbox**: marks column for GROUP BY clause
   - **Comparison operator dropdown**: =, !=, >, <, >=, <=, LIKE, NOT LIKE, IN, NOT IN, BETWEEN, IS NULL, IS NOT NULL — replaces free-text filter input with `[operator dropdown] [value input]`
3. **HAVING section**: Separate row area below the main grid for post-aggregation filters (same column/operator/value pattern)
4. **JOIN row**: Special section above the main grid with:
   - Tab dropdown (lists all open file tabs)
   - Join type dropdown (INNER, LEFT, RIGHT, FULL)
   - ON column pickers (left column from current tab, right column from joined tab)
   - Multiple JOINs supported (add/remove)
5. **CTEs**: Not in the builder — users type `WITH ... AS (...)` directly in the textarea
6. **SQL generation**: `_generateSQL` extended to emit GROUP BY, HAVING, JOIN clauses. JOIN tables loaded from other tabs' content via editorManager/tabManager.

## Advanced Grid Layout (Basic → Advanced)

### Basic mode (current)
| Column | Alias | Sort | Filter | Output | × |

### Advanced mode
| Column | Aggregate | Alias | Group By | Sort | Operator | Value | Output | × |

Plus:
- **JOIN section** above the grid (collapsible)
- **HAVING section** below the grid (collapsible)

## JOIN Implementation

- Each open tab's content is parsed into a named table (filename without extension as alias)
- Active tab is always `data`; joined tabs get their filename alias
- `_parseContent` reused to get columns from joined tabs
- alasql receives multiple data arrays: `alasql(sql, [data, joinedData1, ...])`

## Open Questions

- Should the operator dropdown also be available in basic mode? (It's strictly better than free-text.)
- Maximum number of JOINs to support? (Probably 3-4 is plenty.)
- Should HAVING rows auto-append like the main grid rows do?

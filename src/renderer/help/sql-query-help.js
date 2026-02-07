export const SQL_QUERY_HELP = `# SQL Query Builder Guide

Open the SQL Query panel with **Tools > SQL Query** (Ctrl+Shift+Q).

The query builder lets you visually construct SQL queries against the contents of your open files.
CSV, TSV, JSON, and XML files are all supported.

---

## Getting Started

1. Open a data file (CSV, TSV, JSON, or XML)
2. Open the SQL panel: **Tools > SQL Query** or **Ctrl+Shift+Q**
3. Check **"First line as header"** if your file has column headers
4. Click **Refresh** to load columns into the builder
5. Pick columns, set filters, and click **Run** (or **Ctrl+Enter**)

## Delimiter Options

| Option | Use for |
|--------|---------|
| Auto-detect | Most files (CSV, TSV, pipe-delimited) |
| Comma | \`.csv\` files |
| Tab | \`.tsv\` / tab-delimited files |
| Pipe | Log files with \`|\` separators |
| Semicolon | European-style CSVs |
| Whitespace | Fixed-width or space-separated data |
| Custom regex | Any pattern, e.g. \`::\` |

## JSON Support

JSON files are parsed structurally — no delimiter needed:

- **Array of objects** (\`[{...}, {...}]\`): Each object becomes a row
- **Nested JSON**: The builder automatically finds the largest array of objects within the structure

### Example: Nested JSON
\`\`\`json
{
  "company": {
    "departments": [
      { "id": 1, "name": "Engineering" },
      { "id": 2, "name": "Marketing" }
    ]
  }
}
\`\`\`
\`SELECT * FROM data\` returns the \`departments\` array as rows with columns \`id\` and \`name\`.

## XML Support

XML files with repeating child elements are parsed as rows:
\`\`\`xml
<root>
  <item><name>Alice</name><age>30</age></item>
  <item><name>Bob</name><age>25</age></item>
</root>
\`\`\`
Each \`<item>\` becomes a row. Attributes are exposed as \`@attrName\` columns.

---

## Basic Mode

The default builder grid:

| Column | Alias | Sort | Filter | Output |
|--------|-------|------|--------|--------|

- **Column**: Pick a column from the dropdown
- **Alias**: Rename the column in output (e.g. \`name AS employee_name\`)
- **Sort**: ASC or DESC ordering
- **Filter**: Free-text condition (e.g. \`> 100\`, \`LIKE '%test%'\`)
- **Output**: Include this column in SELECT (uncheck to filter-only)

Rows auto-append when you select a column in the last row.

### Example
Pick \`department\`, set Filter to \`= 'Engineering'\`, check Output:
\`\`\`sql
SELECT department FROM data WHERE department = 'Engineering'
\`\`\`

---

## Advanced Mode

Click the **Advanced** button in the builder header to switch modes.

The grid expands to:

| Column | Aggregate | Alias | Group | Sort | Operator | Value | Output |
|--------|-----------|-------|-------|------|----------|-------|--------|

### Aggregates

Select an aggregate function per column:

| Function | Description |
|----------|-------------|
| NONE | No aggregation (raw value) |
| COUNT | Count of values |
| SUM | Sum of numeric values |
| AVG | Average of numeric values |
| MIN | Minimum value |
| MAX | Maximum value |

### Group By

Check the **Group** checkbox to include a column in the \`GROUP BY\` clause.
When using aggregates, group the non-aggregated columns.

### Example: Count employees per department
1. Row 1: Column = \`department\`, check **Group**, check **Output**
2. Row 2: Column = \`name\`, Aggregate = **COUNT**, Alias = \`count\`, check **Output**

\`\`\`sql
SELECT department, COUNT(name) AS count FROM data GROUP BY department
\`\`\`

### Comparison Operators

Instead of free-text filters, Advanced mode gives you a dropdown:

| Operator | Example | Notes |
|----------|---------|-------|
| = | \`salary = 50000\` | Exact match |
| != | \`status != 'inactive'\` | Not equal |
| > | \`age > 30\` | Greater than |
| < | \`price < 100\` | Less than |
| >= | \`score >= 90\` | Greater or equal |
| <= | \`rating <= 3\` | Less or equal |
| LIKE | \`name LIKE '%son'\` | Pattern match (use % wildcard) |
| NOT LIKE | \`email NOT LIKE '%spam%'\` | Negative pattern |
| IN | \`city IN ('NYC', 'LA', 'SF')\` | Value in list (comma-separated) |
| NOT IN | \`status NOT IN ('deleted', 'archived')\` | Value not in list |
| BETWEEN | \`salary BETWEEN 50000 AND 100000\` | Range (shows two value inputs) |
| IS NULL | \`manager IS NULL\` | Null check (value input hidden) |
| IS NOT NULL | \`email IS NOT NULL\` | Not-null check (value input hidden) |

---

## HAVING Section

The HAVING section appears below the builder grid in Advanced mode.
Click **+ Add** to add HAVING conditions.

HAVING filters rows *after* aggregation (unlike WHERE which filters before).

Each row has: **Aggregate** | **Column** | **Operator** | **Value**

### Example
Filter to departments with more than 2 employees:
- Aggregate: COUNT
- Column: name
- Operator: >
- Value: 2

\`\`\`sql
SELECT department, COUNT(name) FROM data
GROUP BY department HAVING COUNT(name) > 2
\`\`\`

---

## JOINs (Cross-Tab Queries)

The JOIN section appears above the builder grid in Advanced mode.
Click **+ Add Join** to join data from another open tab.

Each JOIN row has:
- **Tab**: Select another open file tab
- **Type**: INNER, LEFT, RIGHT, or FULL
- **ON**: Pick the matching columns from each tab

When JOINs are active, column names get table prefixes (\`t1.\`, \`t2.\`, etc.):
- \`t1.\` = active tab (main data)
- \`t2.\` = first joined tab
- \`t3.\` = second joined tab, etc.

### Example: Join employees with departments

Open both files, then in the SQL panel for \`employees.csv\`:
1. Click **Advanced**, then **+ Add Join**
2. Select \`departments.csv\` tab
3. Type: INNER
4. Left column: \`department\` — Right column: \`department\`
5. Pick output columns: \`t1.name\`, \`t1.department\`, \`t2.budget\`

\`\`\`sql
SELECT t1.name, t1.department, t2.budget
FROM ? AS t1 JOIN ? AS t2 ON t1.department = t2.department
\`\`\`

### Edge Cases
- **Tab closed**: The JOIN row shows a warning; Run shows an error
- **Tab empty/unparseable**: Same treatment — skipped with warning
- **No JOINs active**: Column names have no prefix (normal behavior)

---

## Writing SQL Directly

You can always type SQL directly in the textarea instead of using the builder.
The builder generates SQL into the textarea, but you can edit it freely.

### Special Columns

Every parsed file includes these built-in columns:

| Column | Description |
|--------|-------------|
| \`_num\` | Source line number (click a result row to jump there) |
| \`_line\` | Full original line text |
| \`_index\` | Array index (JSON/XML only) |

### Tips
- Use \`FROM data\` for the active tab's content
- \`LIMIT N\` to cap results
- CTEs (\`WITH ... AS\`) can be typed directly — they're not in the builder
- The query runs via [AlaSQL](https://github.com/alasql/alasql) — most standard SQL works
- Click any result row with a \`_num\` column to jump to that line in the editor
- **Export** button saves results as a TSV in a new tab

---

## Sample Data Files

### employees.csv
\`\`\`
name,department,salary,city
Alice,Engineering,95000,San Francisco
Bob,Engineering,88000,San Francisco
Carol,Marketing,72000,New York
Dave,Marketing,68000,New York
Eve,Engineering,105000,Austin
Frank,Sales,65000,Chicago
Grace,Sales,71000,Chicago
Hank,Engineering,92000,Austin
Ivy,Marketing,78000,New York
Jack,Sales,60000,Chicago
\`\`\`

### departments.csv
\`\`\`
department,budget,head
Engineering,500000,Alice
Marketing,200000,Carol
Sales,150000,Frank
\`\`\`

### nested.json
\`\`\`json
{
  "company": {
    "name": "Tech Solutions Inc.",
    "departments": [
      { "id": 1, "name": "Engineering", "budget": 500000 },
      { "id": 2, "name": "Marketing", "budget": 200000 },
      { "id": 3, "name": "Sales", "budget": 150000 }
    ]
  }
}
\`\`\`

## Quick Recipes

**Top 5 highest salaries:**
\`\`\`sql
SELECT name, salary FROM data ORDER BY salary DESC LIMIT 5
\`\`\`

**Average salary by city:**
\`\`\`sql
SELECT city, AVG(salary) AS avg_salary FROM data GROUP BY city
\`\`\`

**Employees earning above department average (CTE):**
\`\`\`sql
WITH dept_avg AS (SELECT department, AVG(salary) AS avg FROM data GROUP BY department)
SELECT d.name, d.salary, da.avg
FROM ? AS d JOIN ? AS da ON d.department = da.department
WHERE d.salary > da.avg
\`\`\`

**Search log lines containing "ERROR":**
\`\`\`sql
SELECT _num, _line FROM data WHERE _line LIKE '%ERROR%'
\`\`\`

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+Q | Open/close SQL panel |
| Ctrl+Enter | Run query |
| Escape | Close SQL panel |
`;

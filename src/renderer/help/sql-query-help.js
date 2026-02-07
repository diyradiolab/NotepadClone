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

### Example: Flat / Simple Nested JSON
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

### Multi-Table Nested JSON

When JSON contains deeply nested arrays of objects, the builder automatically flattens them into **multiple relational tables** linked by foreign keys.

**How it works:**
- Each nested array of objects becomes its own table (e.g. \`projects\`, \`tasks\`)
- A **table chips bar** appears showing all detected tables with row counts — click a chip to preview that table
- Nested objects flatten into \`prefix_field\` columns (e.g. a \`department.manager.name\` field becomes \`department_manager_name\`)
- Nested arrays become child tables linked by FK columns (e.g. \`_id\`, \`_projectId\`)
- Scalar arrays (e.g. \`["Java", "Go"]\`) become child tables with a \`value\` column
- The root table gets \`_num\` (source line number) and \`_index\` columns; child tables do not

**FK convention:** The FK column is named after the parent's ID field with a \`_\` prefix. If the parent has an \`id\` field, children get \`_id\`. If the parent has \`projectId\`, children get \`_projectId\`. If no ID field is found, the FK defaults to \`_row\` (the parent's array index).

## Multi-Table JSON Queries

Once a multi-table JSON is loaded, you can query any table by name and JOIN across them.

**Query a specific table:**
\`\`\`sql
SELECT * FROM [projects]
\`\`\`

**JOIN across tables:**
\`\`\`sql
SELECT d.name, p.title, t.task
FROM [data] d
JOIN [projects] p ON d.id = p._id
JOIN [tasks] t ON p.projectId = t._projectId
\`\`\`

**Filter a child table:**
\`\`\`sql
SELECT * FROM [technologiesUsed] WHERE value = 'Go'
\`\`\`

**Aggregate across tables:**
\`\`\`sql
SELECT d.name, COUNT(p.title) AS project_count
FROM [data] d
JOIN [projects] p ON d.id = p._id
GROUP BY d.name
\`\`\`

> **Note:** Wrap table names in \`[brackets]\` when they contain special characters or could conflict with SQL keywords. \`FROM data\` (no brackets) also works for the root table.

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

### multi-table.json (multi-table nested)
\`\`\`json
[
  {
    "id": 1, "name": "Alice", "department": { "name": "Engineering", "floor": 3 },
    "projects": [
      { "projectId": 101, "title": "Backend API",
        "tasks": [
          { "task": "Design schema", "status": "done" },
          { "task": "Write endpoints", "status": "in-progress" }
        ],
        "technologiesUsed": ["Go", "PostgreSQL"]
      },
      { "projectId": 102, "title": "CLI Tool",
        "tasks": [{ "task": "Argument parser", "status": "done" }],
        "technologiesUsed": ["Rust"]
      }
    ]
  },
  {
    "id": 2, "name": "Bob", "department": { "name": "Marketing", "floor": 2 },
    "projects": [
      { "projectId": 201, "title": "Campaign Site",
        "tasks": [{ "task": "Landing page", "status": "in-progress" }],
        "technologiesUsed": ["React", "CSS"]
      }
    ]
  }
]
\`\`\`
Produces tables: **data** (2 rows), **projects** (3), **tasks** (4), **technologiesUsed** (5).

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

**Multi-table JSON — list all tasks with employee and project names:**
\`\`\`sql
SELECT d.name AS employee, p.title AS project, t.task, t.status
FROM [data] d
JOIN [projects] p ON d.id = p._id
JOIN [tasks] t ON p.projectId = t._projectId
ORDER BY d.name, p.title
\`\`\`

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+Q | Open/close SQL panel |
| Ctrl+Enter | Run query |
| Escape | Close SQL panel |
`;

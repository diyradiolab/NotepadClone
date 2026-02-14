'use strict';

/**
 * db-export-service.js — Export query results to SQLite or MS SQL Server.
 * Lazy-requires `better-sqlite3` and `mssql` so the app starts fast
 * even if these optional deps aren't installed.
 */

/**
 * Infer column types from data rows.
 * Returns an array of { name, type } where type is 'INTEGER', 'REAL', or 'TEXT'.
 */
function inferColumnTypes(columns, rows) {
  return columns.map(col => {
    let allInt = true;
    let allNum = true;
    let sampled = false;

    for (const row of rows) {
      const val = row[col];
      if (val === null || val === undefined || val === '') continue;
      sampled = true;

      const num = Number(val);
      if (!isFinite(num)) {
        allInt = false;
        allNum = false;
        break;
      }
      if (!Number.isInteger(num)) {
        allInt = false;
      }
    }

    if (!sampled) return { name: col, type: 'TEXT' };
    if (allInt) return { name: col, type: 'INTEGER' };
    if (allNum) return { name: col, type: 'REAL' };
    return { name: col, type: 'TEXT' };
  });
}

/**
 * Export data to a local SQLite file.
 * @param {string} filePath - Path to the .db file
 * @param {string} tableName - Target table name
 * @param {string[]} columns - Column names
 * @param {object[]} rows - Array of row objects
 * @returns {{ success: boolean, rowCount?: number, error?: string }}
 */
function exportToSQLite(filePath, tableName, columns, rows) {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    return { success: false, error: 'better-sqlite3 is not installed. Run: npm install better-sqlite3' };
  }

  try {
    const db = new Database(filePath);

    const typed = inferColumnTypes(columns, rows);
    const quotedName = `"${tableName.replace(/"/g, '""')}"`;

    // DROP + CREATE
    db.exec(`DROP TABLE IF EXISTS ${quotedName}`);
    const colDefs = typed.map(c => `"${c.name.replace(/"/g, '""')}" ${c.type}`).join(', ');
    db.exec(`CREATE TABLE ${quotedName} (${colDefs})`);

    // Prepared INSERT inside a transaction
    const placeholders = columns.map(() => '?').join(', ');
    const insert = db.prepare(`INSERT INTO ${quotedName} VALUES (${placeholders})`);

    const insertAll = db.transaction((dataRows) => {
      for (const row of dataRows) {
        const vals = columns.map(c => {
          const v = row[c];
          return v === undefined ? null : v;
        });
        insert.run(...vals);
      }
    });

    insertAll(rows);
    db.close();

    return { success: true, rowCount: rows.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Map inferred types to MSSQL type constants.
 */
function getMSSQLType(mssql, inferredType) {
  switch (inferredType) {
    case 'INTEGER': return mssql.Int;
    case 'REAL': return mssql.Float;
    default: return mssql.NVarChar(mssql.MAX);
  }
}

/**
 * Map inferred types to MSSQL CREATE TABLE type strings.
 */
function getMSSQLTypeName(inferredType) {
  switch (inferredType) {
    case 'INTEGER': return 'INT';
    case 'REAL': return 'FLOAT';
    default: return 'NVARCHAR(MAX)';
  }
}

/**
 * Export data to MS SQL Server.
 * @param {object} config - { server, port, database, user, password, encrypt, trustServerCertificate }
 * @param {string} tableName - Target table name
 * @param {string[]} columns - Column names
 * @param {object[]} rows - Array of row objects
 * @returns {Promise<{ success: boolean, rowCount?: number, error?: string }>}
 */
async function exportToMSSQL(config, tableName, columns, rows) {
  let mssql;
  try {
    mssql = require('mssql');
  } catch (err) {
    return { success: false, error: 'mssql is not installed. Run: npm install mssql' };
  }

  let pool;
  try {
    const connConfig = {
      server: config.server,
      port: parseInt(config.port, 10) || 1433,
      database: config.database,
      user: config.user,
      password: config.password,
      options: {
        encrypt: config.encrypt !== false,
        trustServerCertificate: config.trustServerCertificate !== false,
      },
      connectionTimeout: 15000,
      requestTimeout: 60000,
    };

    pool = await new mssql.ConnectionPool(connConfig).connect();

    const typed = inferColumnTypes(columns, rows);
    const bracketName = `[${tableName.replace(/\]/g, ']]')}]`;

    // DROP + CREATE
    await pool.request().query(`IF OBJECT_ID('${tableName.replace(/'/g, "''")}', 'U') IS NOT NULL DROP TABLE ${bracketName}`);
    const colDefs = typed.map(c => `[${c.name.replace(/\]/g, ']]')}] ${getMSSQLTypeName(c.type)}`).join(', ');
    await pool.request().query(`CREATE TABLE ${bracketName} (${colDefs})`);

    // Bulk insert via mssql Table object
    const table = new mssql.Table(tableName);
    table.create = false; // table already created

    for (const col of typed) {
      table.columns.add(col.name, getMSSQLType(mssql, col.type), { nullable: true });
    }

    for (const row of rows) {
      const vals = columns.map(c => {
        const v = row[c];
        return v === undefined || v === '' ? null : v;
      });
      table.rows.add(...vals);
    }

    await pool.request().bulk(table);
    await pool.close();

    return { success: true, rowCount: rows.length };
  } catch (err) {
    if (pool) try { await pool.close(); } catch { /* ignore */ }
    return { success: false, error: err.message };
  }
}

/**
 * Test an MSSQL connection.
 * @param {object} config - Same shape as exportToMSSQL config
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function testMSSQLConnection(config) {
  let mssql;
  try {
    mssql = require('mssql');
  } catch (err) {
    return { success: false, error: 'mssql is not installed. Run: npm install mssql' };
  }

  let pool;
  try {
    const connConfig = {
      server: config.server,
      port: parseInt(config.port, 10) || 1433,
      database: config.database,
      user: config.user,
      password: config.password,
      options: {
        encrypt: config.encrypt !== false,
        trustServerCertificate: config.trustServerCertificate !== false,
      },
      connectionTimeout: 10000,
    };

    pool = await new mssql.ConnectionPool(connConfig).connect();
    await pool.close();
    return { success: true };
  } catch (err) {
    if (pool) try { await pool.close(); } catch { /* ignore */ }
    return { success: false, error: err.message };
  }
}

module.exports = { exportToSQLite, exportToMSSQL, testMSSQLConnection };

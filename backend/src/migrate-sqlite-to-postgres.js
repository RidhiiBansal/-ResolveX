import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { postgresSchema } from "./postgres-schema.js";

const { Pool } = pg;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = process.env.SQLITE_MIGRATION_PATH ||
  resolve(projectRoot, "database", "resolvex.sqlite");
const tableDefinitions = [
  {
    name: "tickets",
    key: "ticket_number",
    columns: [
      "ticket_number", "title", "customer", "description", "category",
      "priority", "status", "created_at"
    ],
    hasSequence: true
  },
  {
    name: "profile",
    key: "id",
    columns: ["id", "display_name"],
    hasSequence: false
  },
  {
    name: "users",
    key: "id",
    columns: ["id", "email", "display_name", "password_hash", "role", "created_at"],
    hasSequence: true
  },
  {
    name: "sessions",
    key: "id",
    columns: ["id", "user_id", "token_hash", "expires_at", "created_at"],
    hasSequence: true
  }
];

function normalizedValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  return value;
}

function rowsMatch(columns, sourceRow, targetRow) {
  return columns.every(column =>
    normalizedValue(sourceRow[column]) === normalizedValue(targetRow[column])
  );
}

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Set DATABASE_URL to the Neon PostgreSQL connection string before migrating.");
  }

  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000
  });
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(postgresSchema);

    const summary = [];
    for (const table of tableDefinitions) {
      const columns = table.columns.join(", ");
      const sourceRows = source.prepare(
        `SELECT ${columns} FROM ${table.name} ORDER BY ${table.key}`
      ).all();
      let imported = 0;
      let unchanged = 0;

      for (const sourceRow of sourceRows) {
        const { rows: targetRows } = await client.query(
          `SELECT ${columns} FROM ${table.name} WHERE ${table.key} = $1`,
          [sourceRow[table.key]]
        );

        if (targetRows.length > 0) {
          if (!rowsMatch(table.columns, sourceRow, targetRows[0])) {
            throw new Error(
              `PostgreSQL table ${table.name} has a conflicting row for ${table.key}=${sourceRow[table.key]}; no changes were committed.`
            );
          }
          unchanged += 1;
          continue;
        }

        const placeholders = table.columns.map((_, index) => `$${index + 1}`).join(", ");
        const result = await client.query(`
          INSERT INTO ${table.name} (${columns})
          VALUES (${placeholders})
          ON CONFLICT DO NOTHING
          RETURNING ${table.key}
        `, table.columns.map(column => sourceRow[column]));

        if (result.rowCount !== 1) {
          throw new Error(
            `PostgreSQL table ${table.name} has a conflicting unique value; no changes were committed.`
          );
        }
        imported += 1;
      }

      summary.push(`${table.name}: ${imported} imported, ${unchanged} already identical`);
    }

    for (const table of tableDefinitions.filter(definition => definition.hasSequence)) {
      await client.query(`
        SELECT setval(
          pg_get_serial_sequence($1, $2),
          COALESCE(MAX(${table.key}), 1),
          COUNT(*) > 0
        )
        FROM ${table.name}
      `, [table.name, table.key]);
    }

    await client.query("COMMIT");
    console.log("SQLite data migration complete. Source file was read-only.");
    for (const line of summary) console.log(line);
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Failed to roll back the PostgreSQL migration.", rollbackError.message);
      }
    }
    throw error;
  } finally {
    source.close();
    if (client) client.release();
    await pool.end();
  }
}

migrate().catch(error => {
  console.error("SQLite-to-PostgreSQL migration failed.", error.message);
  process.exitCode = 1;
});

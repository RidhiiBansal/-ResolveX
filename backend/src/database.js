import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { postgresSchema } from "./postgres-schema.js";

const { Pool } = pg;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schemaPath = resolve(projectRoot, "database", "schema.sql");
const allowedLockTables = new Set(["tickets", "users"]);
const seedTickets = [
  {
    title: "Unable to reset password",
    customer: "Aarav Sharma",
    description: "Customer cannot reset their password using the recovery email.",
    category: "Account",
    priority: "High",
    status: "Open"
  },
  {
    title: "Payment transaction failed",
    customer: "Priya Verma",
    description: "Payment was declined even though the bank shows the charge as authorized.",
    category: "Billing",
    priority: "Critical",
    status: "Pending"
  },
  {
    title: "Account verification issue",
    customer: "Rohan Mehta",
    description: "Verification is complete but the account still appears unverified.",
    category: "Account",
    priority: "Low",
    status: "Resolved"
  },
  {
    title: "Dashboard loading slowly",
    customer: "Ananya Singh",
    description: "Dashboard pages take a long time to load.",
    category: "Technical",
    priority: "Medium",
    status: "Open"
  },
  {
    title: "Unable to update profile",
    customer: "Kabir Gupta",
    description: "Profile changes are not saved after submitting the form.",
    category: "Account",
    priority: "Low",
    status: "Resolved"
  }
];

function toPostgresPlaceholders(sql) {
  let parameterIndex = 0;
  return sql.replace(/\?/g, () => `$${++parameterIndex}`);
}

function createSQLiteAdapter(database) {
  const query = async (sql, params = []) => {
    const statement = database.prepare(sql);
    if (statement.columns().length > 0) {
      const rows = statement.all(...params);
      return { rows, rowCount: rows.length };
    }

    const result = statement.run(...params);
    return { rows: [], rowCount: Number(result.changes) };
  };

  const transaction = async callback => {
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = await callback({ query });
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };

  return {
    ready: Promise.resolve(),
    query,
    transaction,
    close: () => database.close()
  };
}

async function initializePostgresDatabase(pool, transaction) {
  await pool.query(postgresSchema);

  await transaction(async database => {
    await database.query(
      "INSERT INTO profile (id, display_name) VALUES (1, ?) ON CONFLICT (id) DO NOTHING",
      ["Ridhi Bansal"]
    );

    const { rows } = await database.query("SELECT COUNT(*) AS count FROM tickets");
    if (Number(rows[0].count) > 0) return;

    for (const ticket of seedTickets) {
      await database.query(`
        INSERT INTO tickets (title, customer, description, category, priority, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        ticket.title,
        ticket.customer,
        ticket.description,
        ticket.category,
        ticket.priority,
        ticket.status
      ]);
    }
  }, { lockTable: "tickets" });
}

function createPostgresAdapter(connectionString) {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000
  });

  const queryWithClient = (client, sql, params = []) =>
    client.query(toPostgresPlaceholders(sql), params);
  const query = (sql, params = []) => queryWithClient(pool, sql, params);

  const transaction = async (callback, { lockTable } = {}) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (lockTable) {
        if (!allowedLockTables.has(lockTable)) {
          throw new Error(`Unsupported transaction lock table: ${lockTable}`);
        }
        await client.query(`LOCK TABLE ${lockTable} IN SHARE ROW EXCLUSIVE MODE`);
      }

      const result = await callback({
        query: (sql, params = []) => queryWithClient(client, sql, params)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Failed to roll back a PostgreSQL transaction.", rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
  };

  const ready = initializePostgresDatabase(pool, transaction);
  ready.catch(error => console.error("Failed to initialize the PostgreSQL database.", error));

  return {
    ready,
    query,
    transaction,
    close: () => pool.end()
  };
}

function createSQLiteDatabase(databasePath) {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec(readFileSync(schemaPath, "utf8"));
  const adapter = createSQLiteAdapter(database);

  const ticketCount = database.prepare("SELECT COUNT(*) AS count FROM tickets").get().count;
  if (ticketCount === 0) {
    const insertTicket = database.prepare(`
      INSERT INTO tickets (title, customer, description, category, priority, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    database.exec("BEGIN");
    try {
      for (const ticket of seedTickets) {
        insertTicket.run(
          ticket.title,
          ticket.customer,
          ticket.description,
          ticket.category,
          ticket.priority,
          ticket.status
        );
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      database.close();
      throw error;
    }
  }

  database.prepare(`
    INSERT OR IGNORE INTO profile (id, display_name) VALUES (1, ?)
  `).run("Ridhi Bansal");

  return adapter;
}

export function createWorkspaceDatabase(databasePath) {
  if (databasePath === undefined && process.env.DATABASE_URL) {
    return createPostgresAdapter(process.env.DATABASE_URL);
  }
  if (databasePath === undefined && process.env.VERCEL) {
    throw new Error("DATABASE_URL is required when running on Vercel.");
  }

  return createSQLiteDatabase(
    databasePath || process.env.RESOLVEX_DB_PATH || resolve(projectRoot, "database", "resolvex.sqlite")
  );
}

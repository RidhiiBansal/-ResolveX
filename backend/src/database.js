import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schemaPath = resolve(projectRoot, "database", "schema.sql");
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

export function createWorkspaceDatabase(
  databasePath = process.env.RESOLVEX_DB_PATH || resolve(projectRoot, "database", "resolvex.sqlite")
) {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec(readFileSync(schemaPath, "utf8"));

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

  return database;
}

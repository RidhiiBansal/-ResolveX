import { createServer } from "node:http";
import {
  createPasswordHash,
  createSession,
  deleteSession,
  getSessionUser,
  verifyPassword
} from "./auth.js";

const categories = new Set(["Technical", "Billing", "Account", "General"]);
const priorities = new Set(["Low", "Medium", "High", "Critical"]);
const statuses = new Set(["Open", "Pending", "Resolved"]);
const maxBodySize = 1024 * 1024;
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)
);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodySize) {
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return value;
}

function requiredText(body, key, label, maxLength) {
  if (typeof body[key] !== "string") {
    throw new HttpError(400, `${label} is required.`);
  }
  const value = body[key].trim();
  if (!value || value.length > maxLength) {
    throw new HttpError(400, `${label} must be between 1 and ${maxLength} characters.`);
  }
  return value;
}

function normalizedEmail(body) {
  const email = requiredText(body, "email", "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  return email;
}

function setupPassword(body) {
  if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) {
    throw new HttpError(400, "Password must be between 12 and 128 characters.");
  }
  return body.password;
}

function loginPassword(body) {
  if (typeof body.password !== "string" || body.password.length === 0 || body.password.length > 128) {
    throw new HttpError(400, "Password is required.");
  }
  return body.password;
}

function verifyRequestOrigin(request) {
  const origin = request.headers.origin;
  if (origin && !isAllowedOrigin(request, origin)) {
    throw new HttpError(403, "Request origin is not allowed.");
  }
}

function isAllowedOrigin(request, origin) {
  if (allowedOrigins.has(origin)) return true;

  try {
    const forwardedProtocol = request.headers["x-forwarded-proto"];
    const protocol = typeof forwardedProtocol === "string"
      ? forwardedProtocol.split(",")[0].trim()
      : request.socket.encrypted ? "https" : "http";
    const host = request.headers.host;
    if (!host) return false;
    return new URL(origin).origin === new URL(request.url, `${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (!origin || !isAllowedOrigin(request, origin)) return;

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("Vary", "Origin");
}

async function requireUser(request, database) {
  const user = await getSessionUser(request, database);
  if (!user) throw new HttpError(401, "Please sign in to continue.");
  return user;
}

async function userFromId(database, userId) {
  const { rows } = await database.query(`
    SELECT id, email, display_name, role FROM users WHERE id = ?
  `, [userId]);
  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role
  };
}

function ticketToJson(row) {
  return {
    id: `RX-${1000 + row.ticket_number}`,
    title: row.title,
    customer: row.customer,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at
  };
}

function ticketNumberFromId(id) {
  const match = /^RX-(\d+)$/.exec(id);
  if (!match) return null;
  const ticketNumber = Number(match[1]) - 1000;
  return Number.isSafeInteger(ticketNumber) && ticketNumber > 0 ? ticketNumber : null;
}

function ticketFieldsFromBody(body, { partial = false, defaultStatus } = {}) {
  const fieldNames = ["title", "customer", "description", "category", "priority", "status"];
  for (const key of Object.keys(body)) {
    if (!fieldNames.includes(key)) {
      throw new HttpError(400, `Ticket field "${key}" is not supported.`);
    }
  }

  const fields = {};
  const textFields = [
    ["title", "Title", 200],
    ["customer", "Customer name", 120],
    ["description", "Description", 2000]
  ];
  for (const [key, label, maxLength] of textFields) {
    if (!partial || Object.hasOwn(body, key)) {
      fields[key] = requiredText(body, key, label, maxLength);
    }
  }

  for (const [key, label, values] of [
    ["category", "Category", categories],
    ["priority", "Priority", priorities]
  ]) {
    if (!partial || Object.hasOwn(body, key)) {
      if (!values.has(body[key])) {
        throw new HttpError(400, `${label} is invalid.`);
      }
      fields[key] = body[key];
    }
  }

  if (!partial || Object.hasOwn(body, "status")) {
    const status = !Object.hasOwn(body, "status") && defaultStatus
      ? defaultStatus
      : body.status;
    if (!statuses.has(status)) {
      throw new HttpError(400, "Status must be Open, Pending, or Resolved.");
    }
    fields.status = status;
  }

  if (partial && Object.keys(fields).length === 0) {
    throw new HttpError(400, "Provide at least one ticket field to update.");
  }
  return fields;
}

async function findTicket(database, ticketNumber) {
  const { rows } = await database.query(`
    SELECT ticket_number, title, customer, description, category, priority, status, created_at
    FROM tickets WHERE ticket_number = ?
  `, [ticketNumber]);
  return rows[0];
}

function createLoginRateLimiter() {
  const failures = new Map();
  const windowMs = 15 * 60 * 1000;
  const maxFailures = 5;

  return {
    assertAllowed(ip) {
      const entry = failures.get(ip);
      if (!entry) return;
      if (Date.now() - entry.startedAt >= windowMs) {
        failures.delete(ip);
        return;
      }
      if (entry.count >= maxFailures) {
        throw new HttpError(429, "Too many sign-in attempts. Try again in 15 minutes.");
      }
    },
    recordFailure(ip) {
      const now = Date.now();
      let entry = failures.get(ip);
      if (!entry || now - entry.startedAt >= windowMs) {
        entry = { count: 0, startedAt: now };
      }
      entry.count += 1;
      failures.set(ip, entry);
    },
    clear(ip) {
      failures.delete(ip);
    }
  };
}

export function createApiHandler(database) {
  const loginRateLimiter = createLoginRateLimiter();
  const dummyPasswordHash = createPasswordHash("ResolveX invalid login placeholder");

  return async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");

    try {
      await database.ready;
      setCorsHeaders(request, response);

      if (request.method === "OPTIONS") {
        verifyRequestOrigin(request);
        response.writeHead(204, { "Cache-Control": "no-store" });
        response.end();
        return;
      }

      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        verifyRequestOrigin(request);
      }

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/auth/state") {
        const user = await getSessionUser(request, database);
        const { rows } = await database.query("SELECT COUNT(*) AS count FROM users");
        sendJson(response, 200, { setupRequired: Number(rows[0].count) === 0, user });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/setup") {
        const body = await readJsonBody(request);
        const email = normalizedEmail(body);
        const displayName = requiredText(body, "displayName", "Display name", 100);
        const password = setupPassword(body);

        const { rows: userCountRows } = await database.query("SELECT COUNT(*) AS count FROM users");
        if (Number(userCountRows[0].count) > 0) {
          throw new HttpError(409, "Initial account setup is already complete.");
        }

        const passwordHash = await createPasswordHash(password);
        const userId = await database.transaction(async transaction => {
          const { rows } = await transaction.query("SELECT COUNT(*) AS count FROM users");
          if (Number(rows[0].count) > 0) {
            throw new HttpError(409, "Initial account setup is already complete.");
          }
          const { rows: insertedUsers } = await transaction.query(`
            INSERT INTO users (email, display_name, password_hash, role)
            VALUES (?, ?, ?, 'admin')
            RETURNING id
          `, [email, displayName, passwordHash]);
          return Number(insertedUsers[0].id);
        }, { lockTable: "users" });

        await createSession(response, database, userId);
        sendJson(response, 201, { user: await userFromId(database, userId) });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readJsonBody(request);
        const email = normalizedEmail(body);
        const password = loginPassword(body);
        const ip = request.socket.remoteAddress || "unknown";
        loginRateLimiter.assertAllowed(ip);

        const { rows } = await database.query(`
          SELECT id, email, display_name, password_hash, role
          FROM users WHERE email = ?
        `, [email]);
        const row = rows[0];
        const passwordMatches = row
          ? await verifyPassword(password, row.password_hash)
          : await verifyPassword(password, await dummyPasswordHash);
        if (!row || !passwordMatches) {
          loginRateLimiter.recordFailure(ip);
          throw new HttpError(401, "Invalid email or password.");
        }

        loginRateLimiter.clear(ip);
        await createSession(response, database, row.id);
        sendJson(response, 200, {
          user: {
            id: row.id,
            email: row.email,
            displayName: row.display_name,
            role: row.role
          }
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        await deleteSession(request, response, database);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/tickets") {
        await requireUser(request, database);
        const { rows } = await database.query(`
          SELECT ticket_number, title, customer, description, category, priority, status, created_at
          FROM tickets
          ORDER BY ticket_number DESC
        `);
        sendJson(response, 200, rows.map(ticketToJson));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/tickets") {
        await requireUser(request, database);
        const body = await readJsonBody(request);
        const ticket = ticketFieldsFromBody(body, { defaultStatus: "Open" });

        const { rows } = await database.query(`
          INSERT INTO tickets (title, customer, description, category, priority, status)
          VALUES (?, ?, ?, ?, ?, ?)
          RETURNING ticket_number, title, customer, description, category, priority, status, created_at
        `, [
          ticket.title,
          ticket.customer,
          ticket.description,
          ticket.category,
          ticket.priority,
          ticket.status
        ]);
        sendJson(response, 201, ticketToJson(rows[0]));
        return;
      }

      const ticketRoute = /^\/api\/tickets\/([^/]+)$/.exec(url.pathname);
      if (ticketRoute && ["GET", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        await requireUser(request, database);
        const ticketNumber = ticketNumberFromId(ticketRoute[1]);
        if (ticketNumber === null) {
          throw new HttpError(404, "Ticket not found.");
        }

        if (request.method === "GET") {
          const row = await findTicket(database, ticketNumber);
          if (!row) throw new HttpError(404, "Ticket not found.");
          sendJson(response, 200, ticketToJson(row));
          return;
        }

        if (request.method === "DELETE") {
          const result = await database.query(
            "DELETE FROM tickets WHERE ticket_number = ?",
            [ticketNumber]
          );
          if (result.rowCount === 0) throw new HttpError(404, "Ticket not found.");
          response.writeHead(204, {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
          });
          response.end();
          return;
        }

        const body = await readJsonBody(request);
        const fields = ticketFieldsFromBody(body, { partial: request.method === "PATCH" });
        const entries = Object.entries(fields);
        const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
        const { rows } = await database.query(
          `UPDATE tickets SET ${assignments} WHERE ticket_number = ?
           RETURNING ticket_number, title, customer, description, category, priority, status, created_at`,
          [...entries.map(([, value]) => value), ticketNumber]
        );
        if (rows.length === 0) {
          throw new HttpError(404, "Ticket not found.");
        }
        sendJson(response, 200, ticketToJson(rows[0]));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/profile") {
        const user = await requireUser(request, database);
        const { rows } = await database.query(
          "SELECT display_name FROM users WHERE id = ?",
          [user.id]
        );
        sendJson(response, 200, { displayName: rows[0].display_name });
        return;
      }

      if (request.method === "PUT" && url.pathname === "/api/profile") {
        const user = await requireUser(request, database);
        const body = await readJsonBody(request);
        const displayName = requiredText(body, "displayName", "Display name", 100);
        await database.query(
          "UPDATE users SET display_name = ? WHERE id = ?",
          [displayName, user.id]
        );
        sendJson(response, 200, { displayName });
        return;
      }

      sendJson(response, 404, { error: "API endpoint not found." });
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message });
        return;
      }
      console.error("API request failed.", error);
      sendJson(response, 500, { error: "An unexpected server error occurred." });
    }
  };
}

export function createApiServer(database) {
  return createServer(createApiHandler(database));
}

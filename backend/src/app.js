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
  if (origin && !allowedOrigins.has(origin)) {
    throw new HttpError(403, "Request origin is not allowed.");
  }
}

function requireUser(request, database) {
  const user = getSessionUser(request, database);
  if (!user) throw new HttpError(401, "Please sign in to continue.");
  return user;
}

function userFromId(database, userId) {
  const row = database.prepare(`
    SELECT id, email, display_name, role FROM users WHERE id = ?
  `).get(userId);
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

function findTicket(database, ticketNumber) {
  return database.prepare(`
    SELECT ticket_number, title, customer, description, category, priority, status, created_at
    FROM tickets WHERE ticket_number = ?
  `).get(ticketNumber);
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

export function createApiServer(database) {
  const loginRateLimiter = createLoginRateLimiter();
  const dummyPasswordHash = createPasswordHash("ResolveX invalid login placeholder");

  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");

    try {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        verifyRequestOrigin(request);
      }

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/auth/state") {
        const user = getSessionUser(request, database);
        const userCount = database.prepare("SELECT COUNT(*) AS count FROM users").get().count;
        sendJson(response, 200, { setupRequired: userCount === 0, user });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/setup") {
        const body = await readJsonBody(request);
        const email = normalizedEmail(body);
        const displayName = requiredText(body, "displayName", "Display name", 100);
        const password = setupPassword(body);

        if (database.prepare("SELECT COUNT(*) AS count FROM users").get().count > 0) {
          throw new HttpError(409, "Initial account setup is already complete.");
        }

        const passwordHash = await createPasswordHash(password);
        database.exec("BEGIN IMMEDIATE");
        let result;
        try {
          if (database.prepare("SELECT COUNT(*) AS count FROM users").get().count > 0) {
            throw new HttpError(409, "Initial account setup is already complete.");
          }
          result = database.prepare(`
            INSERT INTO users (email, display_name, password_hash, role)
            VALUES (?, ?, ?, 'admin')
          `).run(email, displayName, passwordHash);
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }

        const userId = Number(result.lastInsertRowid);
        createSession(response, database, userId);
        sendJson(response, 201, { user: userFromId(database, userId) });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readJsonBody(request);
        const email = normalizedEmail(body);
        const password = loginPassword(body);
        const ip = request.socket.remoteAddress || "unknown";
        loginRateLimiter.assertAllowed(ip);

        const row = database.prepare(`
          SELECT id, email, display_name, password_hash, role
          FROM users WHERE email = ?
        `).get(email);
        const passwordMatches = row
          ? await verifyPassword(password, row.password_hash)
          : await verifyPassword(password, await dummyPasswordHash);
        if (!row || !passwordMatches) {
          loginRateLimiter.recordFailure(ip);
          throw new HttpError(401, "Invalid email or password.");
        }

        loginRateLimiter.clear(ip);
        createSession(response, database, row.id);
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
        deleteSession(request, response, database);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/tickets") {
        requireUser(request, database);
        const rows = database.prepare(`
          SELECT ticket_number, title, customer, description, category, priority, status, created_at
          FROM tickets
          ORDER BY ticket_number DESC
        `).all();
        sendJson(response, 200, rows.map(ticketToJson));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/tickets") {
        requireUser(request, database);
        const body = await readJsonBody(request);
        const ticket = ticketFieldsFromBody(body, { defaultStatus: "Open" });

        const result = database.prepare(`
          INSERT INTO tickets (title, customer, description, category, priority, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          ticket.title,
          ticket.customer,
          ticket.description,
          ticket.category,
          ticket.priority,
          ticket.status
        );
        const row = findTicket(database, Number(result.lastInsertRowid));
        sendJson(response, 201, ticketToJson(row));
        return;
      }

      const ticketRoute = /^\/api\/tickets\/([^/]+)$/.exec(url.pathname);
      if (ticketRoute && ["GET", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        requireUser(request, database);
        const ticketNumber = ticketNumberFromId(ticketRoute[1]);
        if (ticketNumber === null) {
          throw new HttpError(404, "Ticket not found.");
        }

        if (request.method === "GET") {
          const row = findTicket(database, ticketNumber);
          if (!row) throw new HttpError(404, "Ticket not found.");
          sendJson(response, 200, ticketToJson(row));
          return;
        }

        if (request.method === "DELETE") {
          const result = database.prepare(
            "DELETE FROM tickets WHERE ticket_number = ?"
          ).run(ticketNumber);
          if (result.changes === 0) throw new HttpError(404, "Ticket not found.");
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
        const result = database.prepare(
          `UPDATE tickets SET ${assignments} WHERE ticket_number = ?`
        ).run(...entries.map(([, value]) => value), ticketNumber);
        if (result.changes === 0) {
          throw new HttpError(404, "Ticket not found.");
        }
        const row = findTicket(database, ticketNumber);
        sendJson(response, 200, ticketToJson(row));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/profile") {
        const user = requireUser(request, database);
        const profile = database.prepare(
          "SELECT display_name FROM users WHERE id = ?"
        ).get(user.id);
        sendJson(response, 200, { displayName: profile.display_name });
        return;
      }

      if (request.method === "PUT" && url.pathname === "/api/profile") {
        const user = requireUser(request, database);
        const body = await readJsonBody(request);
        const displayName = requiredText(body, "displayName", "Display name", 100);
        database.prepare(
          "UPDATE users SET display_name = ? WHERE id = ?"
        ).run(displayName, user.id);
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
  });
}

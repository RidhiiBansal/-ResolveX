import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const passwordKeyLength = 64;
const sessionLifetimeSeconds = 12 * 60 * 60;
const sessionCookieName = "resolvex_session";
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function cookieToken(request) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === sessionCookieName) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function cookieAttributes(maxAge) {
  const production = process.env.NODE_ENV === "production";
  const secure = production ? "; Secure" : "";
  const sameSite = production ? "None" : "Strict";
  return `HttpOnly; Path=/api; SameSite=${sameSite}; Max-Age=${maxAge}${secure}`;
}

export async function createPasswordHash(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, passwordKeyLength, scryptOptions);
  return `scrypt$${salt.toString("hex")}$${Buffer.from(derivedKey).toString("hex")}`;
}

export async function verifyPassword(password, passwordHash) {
  const [algorithm, saltHex, keyHex] = passwordHash.split("$");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/i.test(saltHex) || !/^[a-f0-9]{128}$/i.test(keyHex)) {
    return false;
  }

  const expectedKey = Buffer.from(keyHex, "hex");
  const derivedKey = Buffer.from(
    await scrypt(password, Buffer.from(saltHex, "hex"), expectedKey.length, scryptOptions)
  );
  return timingSafeEqual(derivedKey, expectedKey);
}

export async function getSessionUser(request, database) {
  const token = cookieToken(request);
  if (!token || token.length > 128) return null;

  const now = new Date().toISOString();
  await database.query("DELETE FROM sessions WHERE expires_at <= ?", [now]);
  const { rows } = await database.query(`
    SELECT users.id, users.email, users.display_name, users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `, [hashSessionToken(token), now]);
  const user = rows[0];

  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role
  };
}

export async function createSession(response, database, userId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000).toISOString();
  await database.query(`
    INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)
  `, [userId, hashSessionToken(token), expiresAt]);
  response.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=${token}; ${cookieAttributes(sessionLifetimeSeconds)}`
  );
}

export async function deleteSession(request, response, database) {
  const token = cookieToken(request);
  if (token && token.length <= 128) {
    await database.query("DELETE FROM sessions WHERE token_hash = ?", [hashSessionToken(token)]);
  }
  response.setHeader("Set-Cookie", `${sessionCookieName}=; ${cookieAttributes(0)}`);
}

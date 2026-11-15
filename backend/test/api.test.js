import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createApiServer } from "../src/app.js";
import { createWorkspaceDatabase } from "../src/database.js";

let server;
let database;
let baseUrl;

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
  if (database) await database.close();
});

test("first-account setup, login, and authenticated workspace API", async () => {
  database = createWorkspaceDatabase(":memory:");
  server = createApiServer(database);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const setupStateResponse = await fetch(`${baseUrl}/api/auth/state`);
  assert.deepEqual(await setupStateResponse.json(), { setupRequired: true, user: null });

  const unauthorizedTicketsResponse = await fetch(`${baseUrl}/api/tickets`);
  assert.equal(unauthorizedTicketsResponse.status, 401);
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    const response = await fetch(`${baseUrl}/api/tickets/RX-1001`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(method === "PUT" || method === "PATCH"
        ? { body: JSON.stringify({ status: "Resolved" }) }
        : {})
    });
    assert.equal(response.status, 401);
  }

  const preflightResponse = await fetch(`${baseUrl}/api/auth/setup`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  assert.equal(preflightResponse.status, 204);
  assert.equal(preflightResponse.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.equal(preflightResponse.headers.get("access-control-allow-credentials"), "true");

  const sameOriginPreflightResponse = await fetch(`${baseUrl}/api/auth/setup`, {
    method: "OPTIONS",
    headers: {
      Origin: baseUrl,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  assert.equal(sameOriginPreflightResponse.status, 204);
  assert.equal(sameOriginPreflightResponse.headers.get("access-control-allow-origin"), baseUrl);

  const rejectedPreflightResponse = await fetch(`${baseUrl}/api/auth/setup`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://untrusted.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  assert.equal(rejectedPreflightResponse.status, 403);

  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  let setupResponse;
  try {
    setupResponse = await fetch(`${baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: JSON.stringify({
        displayName: "Test Administrator",
        email: "Admin@Example.com",
        password: "correct horse battery staple"
      })
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
  assert.equal(setupResponse.status, 201);
  assert.equal(setupResponse.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.equal(setupResponse.headers.get("access-control-allow-credentials"), "true");
  const setupData = await setupResponse.json();
  assert.deepEqual(setupData.user, {
    id: 1,
    email: "admin@example.com",
    displayName: "Test Administrator",
    role: "admin"
  });
  const sessionCookie = setupResponse.headers.get("set-cookie");
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /SameSite=None/);
  assert.match(sessionCookie, /Secure/);
  const cookie = sessionCookie.split(";")[0];
  const { rows: passwordRows } = await database.query(
    "SELECT password_hash FROM users WHERE id = ?",
    [1]
  );
  assert.notEqual(passwordRows[0].password_hash, "correct horse battery staple");

  const repeatedSetupResponse = await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: "Another Admin",
      email: "other@example.com",
      password: "correct horse battery staple"
    })
  });
  assert.equal(repeatedSetupResponse.status, 409);

  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: "Second Admin",
      email: "second@example.com",
      password: "correct horse battery staple"
    })
  });
  assert.equal(registerResponse.status, 201);
  const registerData = await registerResponse.json();
  assert.equal(registerData.user.email, "second@example.com");

  const duplicateRegisterResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: "Duplicate Admin",
      email: "SECOND@EXAMPLE.COM",
      password: "correct horse battery staple"
    })
  });
  assert.equal(duplicateRegisterResponse.status, 409);

  const authenticatedTicketsResponse = await fetch(`${baseUrl}/api/tickets`, {
    headers: { Cookie: cookie }
  });
  assert.equal(authenticatedTicketsResponse.status, 200);
  const initialTickets = await authenticatedTicketsResponse.json();
  assert.equal(initialTickets.length, 5);
  assert.equal(initialTickets[0].id, "RX-1005");

  const createResponse = await fetch(`${baseUrl}/api/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      title: "New issue",
      customer: "Test Customer",
      description: "Test description",
      category: "Technical",
      priority: "High"
    })
  });
  assert.equal(createResponse.status, 201);
  const createdTicket = await createResponse.json();
  assert.equal(createdTicket.id, "RX-1006");
  assert.equal(createdTicket.status, "Open");

  const getTicketResponse = await fetch(`${baseUrl}/api/tickets/RX-1006`, {
    headers: { Cookie: cookie }
  });
  assert.equal(getTicketResponse.status, 200);
  assert.deepEqual(await getTicketResponse.json(), createdTicket);

  const replaceTicketResponse = await fetch(`${baseUrl}/api/tickets/RX-1006`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      title: "Revised issue",
      customer: "Updated Customer",
      description: "Updated description",
      category: "Billing",
      priority: "Critical",
      status: "Pending"
    })
  });
  assert.equal(replaceTicketResponse.status, 200);
  const replacedTicket = await replaceTicketResponse.json();
  assert.equal(replacedTicket.title, "Revised issue");
  assert.equal(replacedTicket.category, "Billing");
  assert.equal(replacedTicket.status, "Pending");

  const patchTicketResponse = await fetch(`${baseUrl}/api/tickets/RX-1006`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ title: "Patched issue", status: "Resolved" })
  });
  assert.equal(patchTicketResponse.status, 200);
  const patchedTicket = await patchTicketResponse.json();
  assert.equal(patchedTicket.title, "Patched issue");
  assert.equal(patchedTicket.customer, "Updated Customer");
  assert.equal(patchedTicket.status, "Resolved");

  const emptyPatchResponse = await fetch(`${baseUrl}/api/tickets/RX-1006`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({})
  });
  assert.equal(emptyPatchResponse.status, 400);

  const invalidPatchResponse = await fetch(`${baseUrl}/api/tickets/RX-1006`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ priority: "Urgent" })
  });
  assert.equal(invalidPatchResponse.status, 400);

  const missingTicketResponse = await fetch(`${baseUrl}/api/tickets/RX-9999`, {
    headers: { Cookie: cookie }
  });
  assert.equal(missingTicketResponse.status, 404);

  const invalidCreateResponse = await fetch(`${baseUrl}/api/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      title: "   ",
      customer: "Test Customer",
      description: "Test description",
      category: "Technical",
      priority: "High"
    })
  });
  assert.equal(invalidCreateResponse.status, 400);

  const deleteTicketResponse = await fetch(`${baseUrl}/api/tickets/RX-1006`, {
    method: "DELETE",
    headers: { Cookie: cookie }
  });
  assert.equal(deleteTicketResponse.status, 204);
  const deletedTicketResponse = await fetch(`${baseUrl}/api/tickets/RX-1006`, {
    headers: { Cookie: cookie }
  });
  assert.equal(deletedTicketResponse.status, 404);
  const ticketsAfterDeleteResponse = await fetch(`${baseUrl}/api/tickets`, {
    headers: { Cookie: cookie }
  });
  assert.equal((await ticketsAfterDeleteResponse.json()).length, 5);

  const profileResponse = await fetch(`${baseUrl}/api/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ displayName: "Updated Administrator" })
  });
  assert.equal(profileResponse.status, 200);
  assert.deepEqual(await profileResponse.json(), { displayName: "Updated Administrator" });

  const persistedProfileResponse = await fetch(`${baseUrl}/api/profile`, {
    headers: { Cookie: cookie }
  });
  assert.deepEqual(await persistedProfileResponse.json(), { displayName: "Updated Administrator" });

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookie }
  });
  assert.equal(logoutResponse.status, 200);
  const loggedOutTicketsResponse = await fetch(`${baseUrl}/api/tickets`, {
    headers: { Cookie: cookie }
  });
  assert.equal(loggedOutTicketsResponse.status, 401);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@example.com",
      password: "correct horse battery staple"
    })
  });
  assert.equal(loginResponse.status, 200);
  assert.match(loginResponse.headers.get("set-cookie"), /HttpOnly/);

  const invalidLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "wrong password" })
  });
  assert.equal(invalidLoginResponse.status, 401);

  const untrustedOriginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://untrusted.example"
    },
    body: JSON.stringify({
      email: "admin@example.com",
      password: "correct horse battery staple"
    })
  });
  assert.equal(untrustedOriginResponse.status, 403);
});

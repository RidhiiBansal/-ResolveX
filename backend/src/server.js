import { createApiServer } from "./app.js";
import { createWorkspaceDatabase } from "./database.js";

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const database = createWorkspaceDatabase();
const server = createApiServer(database);

server.listen(port, "127.0.0.1", () => {
  console.log(`ResolveX API listening at http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(error => {
    database.close();
    if (error) {
      console.error("Failed to close the API server cleanly.", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

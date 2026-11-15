import { createApiServer } from "./app.js";
import { createWorkspaceDatabase } from "./database.js";

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const database = createWorkspaceDatabase();
const server = createApiServer(database);

await database.ready;

server.listen(port, "0.0.0.0", () => {
  console.log(`ResolveX API listening on port ${port}`);
});

function shutdown() {
  server.close(async error => {
    try {
      await database.close();
    } catch (closeError) {
      console.error("Failed to close the database connection cleanly.", closeError);
      process.exitCode = 1;
    }
    if (error) {
      console.error("Failed to close the API server cleanly.", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

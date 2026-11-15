import { createApiHandler } from "../src/app.js";
import { createWorkspaceDatabase } from "../src/database.js";

const database = createWorkspaceDatabase();

export default createApiHandler(database);

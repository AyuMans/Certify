import "dotenv/config";
import { app } from "./app.js";
import { pool } from "./config/database.js";
import { provider } from "./services/blockchainService.js";
const port = Number(process.env.PORT || 5000);
const server = app.listen(port, process.env.HOST || "127.0.0.1", () => console.log(`Certificate Verification: http://localhost:${port}`));
function shutdown() { server.close(() => { void pool.end(); provider.destroy(); }); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

import dotenv from "dotenv";

dotenv.config();

const { createUser } = await import("./services/authService.js");
const { pool } = await import("./config/database.js");

async function main() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error(
      "ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must be configured in .env"
    );
  }

  const existing = await pool.query("SELECT role FROM users WHERE email = $1", [email.trim().toLowerCase()]);
  if (existing.rows.length) {
    if (existing.rows[0].role !== "ADMIN") throw new Error("ADMIN_EMAIL belongs to a non-admin account");
    console.log("Admin account already exists; password preserved.");
    await pool.end();
    return;
  }

  const user = await createUser(
    name,
    email,
    password,
    "ADMIN"
  );

  console.log("Admin user created successfully.");
  console.log("User ID:", user.id);
  console.log("Name:", user.name);
  console.log("Email:", user.email);
  console.log("Role:", user.role);

  await pool.end();
}

main().catch(async (error) => {
  console.error("Failed to create admin:", error);

  try {
    await pool.end();
  } catch {
    // Database may already be closed.
  }

  process.exitCode = 1;
});

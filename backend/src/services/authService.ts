import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";

export type UserRole = "ADMIN" | "ISSUER" | "VERIFIER";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  created_at: Date;
}

interface UserWithPassword extends User {
  password_hash: string;
}

const JWT_SECRET: string = process.env.JWT_SECRET ?? "";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not configured");
}

export async function createUser(
  name: string,
  email: string,
  password: string,
  role: UserRole
) {
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 200) {
    throw new Error("Name is required");
  }

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("A valid email is required");
  }

  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password) > 72) {
    throw new Error("Password must be at least 8 characters and at most 72 bytes");
  }
  if (!["ADMIN", "ISSUER", "VERIFIER"].includes(role)) throw new Error("Invalid user role");

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await pool.query(
    `
    SELECT id
    FROM users
    WHERE email = $1
    `,
    [normalizedEmail]
  );

  if (existingUser.rows.length > 0) {
    throw new Error("A user with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await pool.query(
    `
    INSERT INTO users (
      name,
      email,
      password_hash,
      role
    )
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, email, role, created_at
    `,
    [
      name.trim(),
      normalizedEmail,
      passwordHash,
      role,
    ]
  );

  return result.rows[0] as User;
}

export async function loginUser(
  email: string,
  password: string
) {
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    throw new Error("Email and password are required");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const result = await pool.query(
    `
    SELECT
      id,
      name,
      email,
      password_hash,
      role,
      created_at
    FROM users
    WHERE email = $1
    `,
    [normalizedEmail]
  );

  if (result.rows.length === 0) {
    throw new Error("Invalid email or password");
  }

  const user = result.rows[0] as UserWithPassword;

  const passwordMatches = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!passwordMatches) {
    throw new Error("Invalid email or password");
  }

  const token = jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn: "8h",
    }
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    },
  };
}

export async function getUserById(userId: number) {
  const result = await pool.query(
    `
    SELECT
      id,
      name,
      email,
      role,
      created_at
    FROM users
    WHERE id = $1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error("User not found");
  }

  return result.rows[0] as User;
}

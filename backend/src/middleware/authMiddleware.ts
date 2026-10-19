import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "../services/authService.js";

const JWT_SECRET: string = process.env.JWT_SECRET ?? "";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not configured");
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    role: UserRole;
  };
}

interface JwtPayload {
  userId: number;
  role: UserRole;
}

export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader) {
    return res.status(401).json({
      status: "ERROR",
      message: "Authentication token is required",
    });
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      status: "ERROR",
      message: "Invalid authentication format",
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      JWT_SECRET
    ) as unknown as JwtPayload;

    if (
      typeof decoded.userId !== "number" ||
      !["ADMIN", "ISSUER", "VERIFIER"].includes(decoded.role)
    ) {
      return res.status(401).json({
        status: "ERROR",
        message: "Invalid authentication token",
      });
    }

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
    };

    next();
  } catch {
    return res.status(401).json({
      status: "ERROR",
      message: "Invalid or expired authentication token",
    });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        status: "ERROR",
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: "ERROR",
        message:
          "You do not have permission to perform this action",
      });
    }

    next();
  };
}
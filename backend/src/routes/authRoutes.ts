import { Router } from "express";
import {
  getUserById,
  loginUser,
  createUser,
} from "../services/authService.js";
import {
  authenticateToken,
  requireRole,
  AuthenticatedRequest,
} from "../middleware/authMiddleware.js";

const router = Router();

router.post("/users", authenticateToken, requireRole("ADMIN"), async (req, res) => {
  try {
    const { name, email, password, role } = req.body ?? {};
    const user = await createUser(name, email, password, role);
    res.status(201).json({ status: "OK", user });
  } catch (error) {
    res.status(400).json({ status: "ERROR", message: error instanceof Error ? error.message : "Unable to create user" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    const result = await loginUser(email, password);

    return res.status(200).json({
      status: "OK",
      message: "Login successful",
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(401).json({
      status: "ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Unable to login",
    });
  }
});

router.get(
  "/me",
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: "ERROR",
          message: "Authentication required",
        });
      }

      const user = await getUserById(req.user.userId);

      return res.status(200).json({
        status: "OK",
        user,
      });
    } catch (error) {
      console.error("Get current user error:", error);

      return res.status(404).json({
        status: "ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Unable to retrieve user",
      });
    }
  }
);

export default router;

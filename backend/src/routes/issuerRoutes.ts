import { Router } from "express";
import {
  registerIssuer,
  removeIssuer,
  getIssuerStatus,
} from "../services/issuerService.js";
import {
  authenticateToken,
  requireRole,
} from "../middleware/authMiddleware.js";

const router = Router();

router.post(
  "/register",
  authenticateToken,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const { issuerAddress } = req.body;

      const result = await registerIssuer(issuerAddress);

      return res.status(200).json({
        status: "OK",
        message: "Issuer registered successfully",
        issuer: result,
      });
    } catch (error) {
      console.error("Issuer registration error:", error);

      return res.status(400).json({
        status: "ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Unable to register issuer",
      });
    }
  }
);

router.post(
  "/remove",
  authenticateToken,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const { issuerAddress } = req.body;

      const result = await removeIssuer(issuerAddress);

      return res.status(200).json({
        status: "OK",
        message: "Issuer removed successfully",
        issuer: result,
      });
    } catch (error) {
      console.error("Issuer removal error:", error);

      return res.status(400).json({
        status: "ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Unable to remove issuer",
      });
    }
  }
);

router.get(
  "/:address",
  authenticateToken,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const address = Array.isArray(req.params.address)
        ? req.params.address[0]
        : req.params.address;
        
      const result = await getIssuerStatus(address);

      return res.status(200).json({
        status: "OK",
        issuer: result,
      });
    } catch (error) {
      console.error("Issuer status error:", error);

      return res.status(400).json({
        status: "ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Unable to retrieve issuer status",
      });
    }
  }
);

export default router;
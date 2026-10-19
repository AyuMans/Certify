import { Router } from "express";
import { certificateContract } from "../services/blockchainService.js";

const router = Router();

router.get("/:hash", async (req, res) => {
  try {
    const { hash } = req.params;

    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      return res.status(400).json({
        status: "ERROR",
        message: "Invalid certificate hash",
      });
    }

    const issuedFilter =
      certificateContract.filters.CertificateIssued(hash);

    const revokedFilter =
      certificateContract.filters.CertificateRevoked(hash);

    const issuedEvents =
      await certificateContract.queryFilter(issuedFilter);

    const revokedEvents =
      await certificateContract.queryFilter(revokedFilter);

    const history = [
      ...issuedEvents.map((event) => ({
        type: "ISSUED",
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      })),

      ...revokedEvents.map((event) => ({
        type: "REVOKED",
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      })),
    ].sort((a, b) => a.blockNumber - b.blockNumber);

    return res.status(200).json({
      status: "OK",
      certificateHash: hash,
      history,
    });
  } catch (error) {
    console.error("Audit history error:", error);

    return res.status(500).json({
      status: "ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Unable to retrieve audit history",
    });
  }
});

export default router;
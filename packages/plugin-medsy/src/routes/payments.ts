import type { Router, Request, Response } from "express";
import type { IPaymentService } from "../types";
import { ServiceContainer } from "../services";
import { db, premiumAccess } from "../database";

/**
 * Payment API routes
 */
export function registerPaymentRoutes(
  api: Router,
  serviceContainer: ServiceContainer | null
) {
  // x402 Payment endpoints
  api.get("/health/x402/pay/:paymentId", async (req: Request, res: Response) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Medsy Plugin is starting up" });
    }

    try {
      const { X402PaymentService } = await import("../services/x402PaymentService.js");
      const x402Service = new X402PaymentService();
      await x402Service.initialize();

      const payment = await x402Service.getPaymentStatus(req.params.paymentId!);
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }

      if (payment.status === "payment_completed") {
        return res.json({
          status: "completed",
          message: "Payment already completed",
          payment
        });
      }

      // Return payment information for client to complete
      res.json({
        status: "pending",
        message: "Complete the payment using your x402-compatible wallet",
        payment: {
          id: payment.paymentId,
          amount: payment.amount,
          currency: payment.currency,
          description: payment.description,
          expiresAt: payment.expiresAt
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Complete x402 payment
  api.post("/health/x402/complete/:paymentId", async (req: Request, res: Response) => {
    if (!serviceContainer) {
      return res.status(503).json({ error: "Medsy Plugin is starting up" });
    }

    try {
      const { paymentId } = req.params;
      const { transactionHash, payerAddress } = req.body;

      if (!transactionHash || !payerAddress) {
        return res.status(400).json({
          error: "Missing required fields: transactionHash, payerAddress"
        });
      }

      const { X402PaymentService } = await import("../services/x402PaymentService.js");
      const x402Service = new X402PaymentService();
      await x402Service.initialize();

      const payment = await x402Service.processPayment(paymentId!, payerAddress!, transactionHash!);

      if (payment.status === "payment_completed") {
        // Grant premium access
        const userId = "demo_user"; // In production, get from auth
        const paymentService = serviceContainer.get<IPaymentService>("paymentService");

        // Extract noteId from payment description
        const noteIdMatch = payment.description.match(/note (\w+)/);
        const noteId = noteIdMatch ? noteIdMatch[1] : "unknown";

        const accessResult = await paymentService.processPremiumAccess(paymentId!, payerAddress!, transactionHash!);

        // Record premium access in database
        await db.insert(premiumAccess).values({
          userId,
          noteId: noteId || "unknown",
          paymentAmount: parseFloat(payment.amount),
          grantedAt: accessResult.grantedAt,
          expiresAt: accessResult.expiresAt
        });

        res.json({
          status: "success",
          message: "Premium access granted",
          payment,
          access: {
            grantedAt: accessResult.grantedAt,
            expiresAt: accessResult.expiresAt,
            transactionHash: accessResult.transactionHash
          }
        });
      } else {
        res.status(402).json({
          status: "pending",
          message: "Payment verification in progress",
          payment
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

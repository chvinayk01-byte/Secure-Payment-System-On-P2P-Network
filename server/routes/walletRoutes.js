const express = require("express");
const mongoose = require("mongoose");
const { randomUUID } = require("crypto");
const { z } = require("zod");

const Wallet = require("../models/Wallet");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const authenticateToken = require("../middleware/auth");
const { rupeesToPaise } = require("../utils/money");

const router = express.Router();

router.use(authenticateToken);

// GET CURRENT USER'S WALLET
router.get("/", async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet) {
      return res.status(404).json({
        message: "Wallet not found.",
      });
    }

    return res.json({
      balance: (wallet.balanceMinor / 100).toFixed(2),
      currency: wallet.currency,
    });
  } catch (error) {
    console.error("Wallet error:", error.message);

    return res.status(500).json({
      message: "Unable to retrieve wallet.",
    });
  }
});

// TRANSFER MONEY
router.post("/transfer", async (req, res) => {
  const schema = z.object({
    receiverEmail: z.string().trim().email().max(254),
    amount: z.union([z.string(), z.number()]),
    idempotencyKey: z.string().uuid().optional(),
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid transfer details.",
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  const receiverEmail = parsed.data.receiverEmail.toLowerCase();

  let amountMinor;

  try {
    amountMinor = rupeesToPaise(parsed.data.amount);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }

  // POC transfer limit: ₹1,00,000 per transfer.
  if (amountMinor > 10000000) {
    return res.status(400).json({
      message: "The maximum transfer amount is ₹1,00,000.",
    });
  }

  if (receiverEmail === req.user.email) {
    return res.status(400).json({
      message: "You cannot transfer money to yourself.",
    });
  }

  const receiver = await User.findOne({ email: receiverEmail });

  if (!receiver) {
    return res.status(404).json({
      message: "Receiver account not found.",
    });
  }

  const idempotencyKey =
    parsed.data.idempotencyKey || randomUUID();

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      // Check for an earlier request using the same key.
      const previous = await Transaction.findOne({
        sender: req.user._id,
        idempotencyKey,
      }).session(session);

      if (previous) {
        result = {
          duplicate: true,
          transaction: previous,
        };
        return;
      }

      // Debit only if the sender has enough funds.
      const senderWallet = await Wallet.findOneAndUpdate(
        {
          user: req.user._id,
          balanceMinor: { $gte: amountMinor },
        },
        {
          $inc: { balanceMinor: -amountMinor },
        },
        {
          new: true,
          session,
        }
      );

      if (!senderWallet) {
        throw new Error("INSUFFICIENT_FUNDS");
      }

      // Credit the receiver.
      const receiverWallet = await Wallet.findOneAndUpdate(
        { user: receiver._id },
        { $inc: { balanceMinor: amountMinor } },
        { new: true, session }
      );

      if (!receiverWallet) {
        throw new Error("RECEIVER_WALLET_NOT_FOUND");
      }

      const [transaction] = await Transaction.create(
        [
          {
            reference: randomUUID(),
            sender: req.user._id,
            receiver: receiver._id,
            amountMinor,
            idempotencyKey,
            status: "SUCCESS",
          },
        ],
        { session }
      );

      result = {
        duplicate: false,
        transaction,
      };
    });

    if (result.duplicate) {
      return res.json({
        message: "This transfer was already processed.",
        reference: result.transaction.reference,
      });
    }

    return res.status(201).json({
      message: "Transfer successful.",
      reference: result.transaction.reference,
      amount: (amountMinor / 100).toFixed(2),
      currency: "INR",
    });
  } catch (error) {
    if (error.message === "INSUFFICIENT_FUNDS") {
      return res.status(400).json({
        message: "Insufficient wallet balance.",
      });
    }

    if (error.message === "RECEIVER_WALLET_NOT_FOUND") {
      return res.status(409).json({
        message: "Receiver wallet is not available.",
      });
    }

    console.error("Transfer error:", error.message);

    return res.status(500).json({
      message: "Transfer failed. Please try again.",
    });
  } finally {
    await session.endSession();
  }
});

module.exports = router;
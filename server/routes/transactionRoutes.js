const express = require("express");

const Transaction = require("../models/Transaction");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

router.use(authenticateToken);

router.get("/", async (req, res) => {
  try {
    const transactions = await Transaction.find({
      $or: [
        { sender: req.user._id },
        { receiver: req.user._id },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("sender", "name email")
      .populate("receiver", "name email")
      .lean();

    const result = transactions.map((transaction) => ({
      reference: transaction.reference,
      amount: (transaction.amountMinor / 100).toFixed(2),
      currency: transaction.currency,
      status: transaction.status,
      direction:
        transaction.sender._id.toString() === req.user._id.toString()
          ? "OUTGOING"
          : "INCOMING",
      sender: transaction.sender,
      receiver: transaction.receiver,
      createdAt: transaction.createdAt,
    }));

    return res.json({ transactions: result });
  } catch (error) {
    console.error("Transaction history error:", error.message);

    return res.status(500).json({
      message: "Unable to retrieve transaction history.",
    });
  }
});

module.exports = router;
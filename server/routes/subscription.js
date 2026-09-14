const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { subscriptionQueries } = require("../db/database");

const router = express.Router();

// =====================================================
// GET CURRENT SUBSCRIPTION
// =====================================================

router.get("/status", authenticateToken, async (req, res) => {
  try {
    const subscription = await subscriptionQueries.getSubscription(req.user.id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "User subscription not found",
      });
    }

    res.json({
      success: true,
      subscription,
    });
  } catch (error) {
    console.error("[SUBSCRIPTION] Status error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to fetch subscription status",
    });
  }
});

module.exports = router;

const { subscriptionQueries } = require("../db/database");

async function requirePro(req, res, next) {
  try {
    const subscription = await subscriptionQueries.getSubscription(req.user.id);

    if (!subscription) {
      return res.status(403).json({
        success: false,
        error: "Subscription not found.",
        code: "SUBSCRIPTION_REQUIRED",
      });
    }

    const isPro =
      subscription.plan === "pro" &&
      subscription.subscription_status === "active" &&
      (!subscription.subscription_expires_at ||
        new Date(subscription.subscription_expires_at) > new Date());

    if (!isPro) {
      return res.status(403).json({
        success: false,
        error: "This feature requires an active Pro subscription.",
        code: "PRO_REQUIRED",
        plan: subscription.plan,
      });
    }

    req.subscription = subscription;
    next();
  } catch (error) {
    console.error("[SUBSCRIPTION] Pro access check failed:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to verify subscription.",
    });
  }
}

module.exports = {
  requirePro,
};

const express = require("express");
const router = express.Router();

const {
  getUserMemories,
  saveMemory,
  removeMemory,
  clearUserMemories,
} = require("../services/memoryService");

const { authenticateToken } = require("../middleware/auth");

router.use(authenticateToken);

// ============================================================
// GET /api/memory
// Get all active memories for the logged-in user
// ============================================================
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;

    const memories = await getUserMemories(userId, 100);

    return res.json({
      success: true,
      memories,
    });
  } catch (error) {
    console.error("[MEMORY GET ERROR]", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to load memories.",
    });
  }
});

// ============================================================
// POST /api/memory
// Create or update a memory
// ============================================================
router.post("/", async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      category,
      memoryKey,
      memoryValue,
      importance,
      confidence,
      source,
      expiresAt,
    } = req.body;

    if (!category) {
      return res.status(400).json({
        success: false,
        error: "category is required.",
      });
    }

    if (!memoryKey) {
      return res.status(400).json({
        success: false,
        error: "memoryKey is required.",
      });
    }

    if (!memoryValue) {
      return res.status(400).json({
        success: false,
        error: "memoryValue is required.",
      });
    }

    const allowedCategories = [
      "preference",
      "fact",
      "project",
      "goal",
      "context",
    ];

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: "Invalid memory category.",
      });
    }

    const memory = await saveMemory({
      userId,
      category,
      memoryKey: String(memoryKey).trim(),
      memoryValue: String(memoryValue).trim(),

      importance: Number.isFinite(Number(importance))
        ? Math.min(10, Math.max(1, Number(importance)))
        : 5,

      confidence: Number.isFinite(Number(confidence))
        ? Math.min(1, Math.max(0, Number(confidence)))
        : 0.8,

      source:
        typeof source === "string" && source.trim()
          ? source.trim()
          : "explicit",

      expiresAt: expiresAt || null,
    });

    return res.status(201).json({
      success: true,
      message: "Memory saved successfully.",
      memory,
    });
  } catch (error) {
    console.error("[MEMORY SAVE ERROR]", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to save memory.",
    });
  }
});

// ============================================================
// DELETE /api/memory/:memoryId
// Delete one memory
// ============================================================
router.delete("/:memoryId", async (req, res) => {
  try {
    const userId = req.user.id;
    const memoryId = Number(req.params.memoryId);

    if (!Number.isInteger(memoryId) || memoryId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid memory ID.",
      });
    }

    const removed = await removeMemory(userId, memoryId);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: "Memory not found.",
      });
    }

    return res.json({
      success: true,
      message: "Memory removed successfully.",
      memoryId,
    });
  } catch (error) {
    console.error("[MEMORY DELETE ERROR]", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to remove memory.",
    });
  }
});

// ============================================================
// DELETE /api/memory
// Delete all memories for the logged-in user
// ============================================================
router.delete("/", async (req, res) => {
  try {
    const userId = req.user.id;

    await clearUserMemories(userId);

    return res.json({
      success: true,
      message: "All memories deleted successfully.",
    });
  } catch (error) {
    console.error("[MEMORY CLEAR ERROR]", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to delete memories.",
    });
  }
});

module.exports = router;

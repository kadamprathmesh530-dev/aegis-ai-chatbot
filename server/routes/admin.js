const express = require('express');
const router = express.Router();
const { userQueries, conversationQueries, messageQueries } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All Admin routes require authentication AND admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/admin/stats
 * Overview analytics for the admin dashboard
 */
router.get('/stats', (req, res) => {
  try {
    const stats = conversationQueries.getAdminStats.get();
    return res.json({
      success: true,
      stats
    });
  } catch (err) {
    console.error('Error getting admin stats:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve administrative statistics.'
    });
  }
});

/**
 * GET /api/admin/users
 * List all registered users with their activity metrics
 */
router.get('/users', (req, res) => {
  try {
    const users = userQueries.getAllUsersWithStats.all();
    return res.json({
      success: true,
      users
    });
  } catch (err) {
    console.error('Error fetching admin users list:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve users.'
    });
  }
});

/**
 * GET /api/admin/users/:userId/conversations
 * View conversations list belonging to a specific user
 */
router.get('/users/:userId/conversations', (req, res) => {
  try {
    const { userId } = req.params;
    const user = userQueries.getById.get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Target user not found.'
      });
    }

    const conversations = conversationQueries.getConversationsBySpecificUserForAdmin.all(userId);
    return res.json({
      success: true,
      user,
      conversations
    });
  } catch (err) {
    console.error('Error fetching user conversations for admin:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve user conversations.'
    });
  }
});

/**
 * GET /api/admin/conversations/:id/messages
 * View full conversation transcript of any user
 */
router.get('/conversations/:id/messages', (req, res) => {
  try {
    const { id } = req.params;
    const conversation = conversationQueries.getById.get(id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found.'
      });
    }

    const owner = userQueries.getById.get(conversation.user_id);
    const messages = messageQueries.getByConversationId.all(id);

    return res.json({
      success: true,
      conversation,
      owner,
      messages
    });
  } catch (err) {
    console.error('Error fetching conversation details for admin:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversation details.'
    });
  }
});

/**
 * PATCH /api/admin/users/:userId/role
 * Update role of a user (user <-> admin)
 */
router.patch('/users/:userId/role', (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || !['user', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Role must be either "user" or "admin".'
      });
    }

    const targetUser = userQueries.getById.get(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    // Safety: prevent admin from demoting themselves if they are the only admin
    if (parseInt(userId, 10) === req.user.id && role === 'user') {
      const stats = conversationQueries.getAdminStats.get();
      if (stats.total_admins <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot demote the last remaining administrator account.'
        });
      }
    }

    userQueries.updateRole.run(role, userId);

    return res.json({
      success: true,
      message: `User role updated to ${role}.`
    });
  } catch (err) {
    console.error('Error updating user role:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update user role.'
    });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Delete a user account and cascade delete conversations
 */
router.delete('/users/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    if (parseInt(userId, 10) === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Administrators cannot delete their own account from this panel.'
      });
    }

    const targetUser = userQueries.getById.get(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    userQueries.deleteUser.run(userId);

    return res.json({
      success: true,
      message: `User ${targetUser.username} and all associated data deleted successfully.`
    });
  } catch (err) {
    console.error('Error deleting user:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete user.'
    });
  }
});

module.exports = router;


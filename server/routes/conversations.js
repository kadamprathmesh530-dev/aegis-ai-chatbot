const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { conversationQueries, messageQueries } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// All conversation routes require an authenticated user
router.use(authenticateToken);

/**
 * GET /api/conversations
 * Retrieve all conversations for the authenticated user
 */
router.get('/', (req, res) => {
  try {
    const conversations = conversationQueries.getByUserId.all(req.user.id);
    return res.json({
      success: true,
      conversations
    });
  } catch (err) {
    console.error('Error fetching conversations:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversations.'
    });
  }
});

/**
 * POST /api/conversations
 * Create a new conversation thread for the authenticated user
 */
router.post('/', (req, res) => {
  try {
    const { title } = req.body;
    const conversationId = uuidv4();
    const cleanTitle = (title && typeof title === 'string' && title.trim().length > 0)
      ? title.trim().substring(0, 100)
      : 'New Conversation';

    conversationQueries.create.run(conversationId, req.user.id, cleanTitle);
    const newConv = conversationQueries.getByIdAndUser.get(conversationId, req.user.id);

    return res.status(201).json({
      success: true,
      conversation: newConv
    });
  } catch (err) {
    console.error('Error creating conversation:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to create conversation.'
    });
  }
});

/**
 * GET /api/conversations/:id
 * Retrieve messages for a specific conversation with strict ownership verification
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Strict authorization check: Only the conversation owner can access this data
    const conversation = conversationQueries.getByIdAndUser.get(id, req.user.id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found or you do not have permission to view it.'
      });
    }

    const messages = messageQueries.getByConversationId.all(id);

    return res.json({
      success: true,
      conversation,
      messages
    });
  } catch (err) {
    console.error('Error fetching conversation messages:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversation messages.'
    });
  }
});

/**
 * PATCH /api/conversations/:id
 * Rename a conversation with strict ownership verification
 */
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'A valid title is required.'
      });
    }

    const cleanTitle = title.trim().substring(0, 100);
    const result = conversationQueries.updateTitle.run(cleanTitle, id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found or you do not have permission to update it.'
      });
    }

    return res.json({
      success: true,
      message: 'Conversation renamed successfully.',
      title: cleanTitle
    });
  } catch (err) {
    console.error('Error updating conversation title:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update conversation title.'
    });
  }
});

/**
 * DELETE /api/conversations/:id
 * Delete a conversation and its messages with strict ownership verification
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const result = conversationQueries.delete.run(id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found or you do not have permission to delete it.'
      });
    }

    return res.json({
      success: true,
      message: 'Conversation deleted successfully.'
    });
  } catch (err) {
    console.error('Error deleting conversation:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete conversation.'
    });
  }
});

module.exports = router;


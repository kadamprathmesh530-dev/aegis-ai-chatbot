const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { userQueries } = require('../db/database');
const { generateToken, authenticateToken, validateRegistrationInput } = require('../middleware/auth');

/**
 * POST /api/auth/register
 * Register a new user account
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validation
    const validationErrors = validateRegistrationInput(username, email, password);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: validationErrors.join(' ')
      });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Check if email already taken
    const existingByEmail = userQueries.getByEmail.get(cleanEmail);
    if (existingByEmail) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email address already exists.'
      });
    }

    // Check if username already taken
    const existingByUsername = userQueries.getByUsername.get(cleanUsername);
    if (existingByUsername) {
      return res.status(409).json({
        success: false,
        error: 'This username is already taken. Please choose another.'
      });
    }

    // Hash password with bcrypt (salt cost 12)
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Determine initial role: Check against configured admin email or first account
    const configuredAdminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const totalUsers = userQueries.getUserCount.get().count;
    const role = (configuredAdminEmail && cleanEmail === configuredAdminEmail) || totalUsers === 0 ? 'admin' : 'user';

    // Insert user
    const result = userQueries.create.run(cleanUsername, cleanEmail, passwordHash, role);
    const userId = result.lastInsertRowid;

    // Fetch user without password
    const newUser = userQueries.getById.get(userId);

    // Generate token
    const token = generateToken(newUser);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.created_at
      },
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred during registration. Please try again.'
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user with credentials
 */
router.post('/login', async (req, res) => {
  try {
    const { loginIdentifier, password } = req.body;

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide both email/username and password.'
      });
    }

    const cleanIdentifier = loginIdentifier.trim();

    // Look up user by email or username
    let user = null;
    if (cleanIdentifier.includes('@')) {
      user = userQueries.getByEmail.get(cleanIdentifier.toLowerCase());
    } else {
      user = userQueries.getByUsername.get(cleanIdentifier);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email/username or password.'
      });
    }

    // Securely compare password hash with bcrypt
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email/username or password.'
      });
    }

    // Update last login timestamp
    userQueries.updateLastLogin.run(user.id);

    // Issue JWT
    const token = generateToken(user);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred during login. Please try again.'
    });
  }
});

/**
 * POST /api/auth/logout
 * Log out user by clearing cookie
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({
    success: true,
    message: 'Logged out successfully.'
  });
});

/**
 * GET /api/auth/me
 * Get current authenticated user profile
 */
router.get('/me', authenticateToken, (req, res) => {
  const user = userQueries.getById.get(req.user.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found.'
    });
  }

  return res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at
    }
  });
});

/**
 * PATCH /api/auth/change-password
 * Change password for authenticated user
 */
router.patch('/change-password', authenticateToken, async (req, res) => {
  console.log('[CHANGE PASSWORD HIT]', {
    userId: req.user?.id,
    time: new Date().toISOString()
  });
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Both current password and new password are required.'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long.'
      });
    }

    const userWithHash = userQueries.getByIdWithPassword.get(req.user.id);
    const isMatch = await bcrypt.compare(currentPassword, userWithHash.password_hash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: 'Incorrect current password.'
      });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    const result = userQueries.updatePassword.run(
      newHash,
      req.user.id
    );

    console.log('[PASSWORD CHANGE]', {
     userId: req.user.id,
      changes: result.changes
    });

    if (result.changes !== 1) {
    return res.status(500).json({
      success: false,
      error: 'Password was not updated in database.'
    });
    }

    return res.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (err) {
    console.error('Password change error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update password.'
    });
  }
});

module.exports = router;


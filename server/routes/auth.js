const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');

const { userQueries } = require('../db/database');
const {
  generateToken,
  authenticateToken,
  validateRegistrationInput
} = require('../middleware/auth');

// Initialize Google OAuth2 client for ID token verification
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * GET /api/config/google
 * Public endpoint to provide Google Web Client ID to frontend
 */
router.get('/config/google', (req, res) => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId || googleClientId === 'your-web-client-id.apps.googleusercontent.com') {
    return res.status(503).json({
      success: false,
      error: 'Google Sign-In is not configured on the server.'
    });
  }
  res.json({ googleClientId });
});

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const validationErrors = validateRegistrationInput(
      username,
      email,
      password
    );

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: validationErrors.join(' ')
      });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Check email
    const existingByEmail = await userQueries.getByEmail(cleanEmail);

    if (existingByEmail) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email address already exists.'
      });
    }

    // Check username
    const existingByUsername =
      await userQueries.getByUsername(cleanUsername);

    if (existingByUsername) {
      return res.status(409).json({
        success: false,
        error: 'This username is already taken. Please choose another.'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Determine role
    const configuredAdminEmail =
      (process.env.ADMIN_EMAIL || '').toLowerCase().trim();

    const userCountResult = await userQueries.getUserCount();
    const totalUsers = Number(userCountResult.count);

    const role =
      (configuredAdminEmail && cleanEmail === configuredAdminEmail) ||
      totalUsers === 0
        ? 'admin'
        : 'user';

    // Create user
    const newUser = await userQueries.create(
      cleanUsername,
      cleanEmail,
      passwordHash,
      role
    );

    const token = generateToken(newUser);

    // Cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
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
      error: 'An unexpected error occurred during registration.'
    });
  }
});


/**
 * POST /api/auth/login
 * Login user
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

    let user;

    if (cleanIdentifier.includes('@')) {
      user = await userQueries.getByEmail(
        cleanIdentifier.toLowerCase()
      );
    } else {
      user = await userQueries.getByUsername(
        cleanIdentifier
      );
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email/username or password.'
      });
    }

    // Compare password
    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email/username or password.'
      });
    }

    // Update login time
    await userQueries.updateLastLogin(user.id);

    // Generate JWT
    const token = generateToken(user);

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
      error: 'An unexpected error occurred during login.'
    });
  }
});


/**
 * POST /api/auth/logout
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
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await userQueries.getById(req.user.id);

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

  } catch (err) {
    console.error('Profile error:', err);

    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve user profile.'
    });
  }
});


/**
 * PATCH /api/auth/change-password
 */
router.patch(
  '/change-password',
  authenticateToken,
  async (req, res) => {
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

      const user = await userQueries.getByIdWithPassword(
        req.user.id
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found.'
        });
      }

      const isMatch = await bcrypt.compare(
        currentPassword,
        user.password_hash
      );

      if (!isMatch) {
        return res.status(400).json({
          success: false,
          error: 'Incorrect current password.'
        });
      }

      const newHash = await bcrypt.hash(newPassword, 12);

      const result = await userQueries.updatePassword(
        newHash,
        req.user.id
      );

      if (result.rowCount !== 1) {
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
  }
);

/**
 * POST /api/auth/google
 * Google Sign-In with ID token verification
 */
router.post('/google', async (req, res) => {
  try {
    const { id_token } = req.body;

    // Validate input
    if (!id_token || typeof id_token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Google ID token is required.'
      });
    }

    // Verify the Google ID token
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: id_token,
        audience: process.env.GOOGLE_CLIENT_ID
      });
    } catch (verifyErr) {
      console.error('Google ID token verification failed:', verifyErr.message);
      return res.status(401).json({
        success: false,
        error: 'Invalid Google ID token.'
      });
    }

    const payload = ticket.getPayload();

    // Validate required claims
    if (!payload.sub) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token: missing subject claim.'
      });
    }

    if (!payload.email) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token: missing email claim.'
      });
    }

    if (payload.email_verified !== true) {
      return res.status(401).json({
        success: false,
        error: 'Google email is not verified.'
      });
    }

    // Check audience matches our client ID
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({
        success: false,
        error: 'Token audience mismatch.'
      });
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase().trim();
    const name = payload.name || '';
    const picture = payload.picture || null;

    // 1. First, try to find user by Google ID
    let user = await userQueries.getByGoogleId(googleId);

    if (user) {
      // Existing Google user - update last_login_at and issue JWT
      await userQueries.updateLastLogin(user.id);

      const token = generateToken(user);

      // Set httpOnly cookie (same as existing login)
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return res.json({
        success: true,
        message: 'Signed in with Google successfully.',
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
    }

    // 2. Google ID not found - check if email exists with email/password account
    const existingByEmail = await userQueries.getByEmail(email);

    if (existingByEmail) {
      // Email exists but with email/password auth - do NOT auto-link
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists. Please sign in with your password.'
      });
    }

    // 3. No existing account - create new Google user
    // Generate a valid username from email/name
    const baseUsername = (name || email.split('@')[0])
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .substring(0, 30);

    let username = baseUsername || 'user';
    let counter = 1;

    // Ensure username is unique
    while (await userQueries.getByUsername(username)) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    // Create Google user (password_hash = NULL, auth_provider = 'google')
    user = await userQueries.createGoogleUser(username, email, googleId, picture);

    // Update last_login_at for new user
    await userQueries.updateLastLogin(user.id);

    // Generate JWT (same as existing login)
    const token = generateToken(user);

    // Set httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(201).json({
      success: true,
      message: 'Account created and signed in with Google successfully.',
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
    console.error('Google Sign-In error:', err);

    // Handle unique constraint violations (race conditions)
    if (err.code === '23505') { // unique_violation
      if (err.constraint === 'users_email_key') {
        return res.status(409).json({
          success: false,
          error: 'An account with this email already exists.'
        });
      }
      if (err.constraint === 'users_username_key') {
        return res.status(409).json({
          success: false,
          error: 'Username conflict. Please try again.'
        });
      }
      if (err.constraint === 'users_google_id_key') {
        return res.status(409).json({
          success: false,
          error: 'This Google account is already linked.'
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred during Google sign-in.'
    });
  }
});

module.exports = router;
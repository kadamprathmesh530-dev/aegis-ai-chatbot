const jwt = require('jsonwebtoken');
const { userQueries } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'default_insecure_secret_key_change_in_production';
const TOKEN_EXPIRY = '7d';

/**
 * Generate signed JWT for authenticated user
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Middleware: Verify JWT and attach authenticated user to request
 */
function authenticateToken(req, res, next) {
  let token = null;

  // Extract from Authorization header: "Bearer <token>"
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    // Or from HttpOnly cookie
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify user still exists in database and get current role
    const user = userQueries.getById.get(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User account not found or deactivated.'
      });
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Session expired. Please log in again.'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token.'
    });
  }
}

/**
 * Middleware: Enforce Admin Role
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Administrator privileges required.'
    });
  }

  next();
}

/**
 * Input validation helpers
 */
function validateRegistrationInput(username, email, password) {
  const errors = [];

  if (!username || typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 30) {
    errors.push('Username must be between 3 and 30 characters.');
  } else if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
    errors.push('Username may only contain letters, numbers, underscores, and hyphens.');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    errors.push('A valid email address is required.');
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    errors.push('Password must be at least 6 characters long.');
  }

  return errors;
}

module.exports = {
  generateToken,
  authenticateToken,
  requireAdmin,
  validateRegistrationInput,
  JWT_SECRET
};


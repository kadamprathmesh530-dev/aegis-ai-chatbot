const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");

const { userQueries } = require("../db/database");
const {
  generateToken,
  authenticateToken,
  validateRegistrationInput,
} = require("../middleware/auth");

// Define the Google OAuth callback URL
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "https://aegis-ai-chatbot.onrender.com/api/auth/google/callback";

// Initialize Google OAuth2 client (authorization-code + PKCE flow)
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
);

// Temporary in-memory store for Google OAuth login sessions
const loginCodes = new Map();
/**
 * GET /api/config/google
 * Public endpoint to provide Google Web Client ID to frontend
 */
/**
 * POST /api/auth/google/start
 * Start Google OAuth authorization-code + PKCE flow
 */
router.post("/google/start", async (req, res) => {
  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!googleClientId || !googleClientSecret) {
      return res.status(503).json({
        success: false,
        error: "Google Sign-In is not configured on the server.",
      });
    }

    const loginCode = crypto.randomBytes(32).toString("hex");
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    loginCodes.set(loginCode, {
      status: "pending",
      verifier: codeVerifier,
      expiresAt_ms: Date.now() + 5 * 60 * 1000,
      token: null,
      user: null,
      consumed: false,
    });

    const authUrl = googleClient.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
      state: loginCode,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return res.json({
      success: true,
      loginCode,
      authUrl,
    });
  } catch (error) {
    console.error("Google OAuth start error:", error);

    return res.status(500).json({
      success: false,
      error: "Could not start Google Sign-In.",
    });
  }
});

router.get("/config/google", (req, res) => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (
    !googleClientId ||
    googleClientId === "your-web-client-id.apps.googleusercontent.com"
  ) {
    return res.status(503).json({
      success: false,
      error: "Google Sign-In is not configured on the server.",
    });
  }
  res.json({ googleClientId });
});

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const validationErrors = validateRegistrationInput(
      username,
      email,
      password,
    );

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: validationErrors.join(" "),
      });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Check email
    const existingByEmail = await userQueries.getByEmail(cleanEmail);

    if (existingByEmail) {
      return res.status(409).json({
        success: false,
        error: "An account with this email address already exists.",
      });
    }

    // Check username
    const existingByUsername = await userQueries.getByUsername(cleanUsername);

    if (existingByUsername) {
      return res.status(409).json({
        success: false,
        error: "This username is already taken. Please choose another.",
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Determine role
    const configuredAdminEmail = (process.env.ADMIN_EMAIL || "")
      .toLowerCase()
      .trim();

    const userCountResult = await userQueries.getUserCount();
    const totalUsers = Number(userCountResult.count);

    const role =
      (configuredAdminEmail && cleanEmail === configuredAdminEmail) ||
      totalUsers === 0
        ? "admin"
        : "user";

    // Create user
    const newUser = await userQueries.create(
      cleanUsername,
      cleanEmail,
      passwordHash,
      role,
    );

    const token = generateToken(newUser);

    // Cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.created_at,
        authProvider: newUser.auth_provider,
        avatarUrl: newUser.avatar_url,
      },
      token,
    });
  } catch (err) {
    console.error("Registration error:", err);

    return res.status(500).json({
      success: false,
      error: "An unexpected error occurred during registration.",
    });
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post("/login", async (req, res) => {
  try {
    const { loginIdentifier, password } = req.body;

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        error: "Please provide both email/username and password.",
      });
    }

    const cleanIdentifier = loginIdentifier.trim();

    let user;

    if (cleanIdentifier.includes("@")) {
      user = await userQueries.getByEmail(cleanIdentifier.toLowerCase());
    } else {
      user = await userQueries.getByUsername(cleanIdentifier);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email/username or password.",
      });
    }

    // Compare password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: "Invalid email/username or password.",
      });
    }

    // Update login time
    await userQueries.updateLastLogin(user.id);

    // Generate JWT
    const token = generateToken(user);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: "Login successful.",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
      },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      success: false,
      error: "An unexpected error occurred during login.",
    });
  }
});

/**
 * POST /api/auth/logout
 */
router.post("/logout", (req, res) => {
  res.clearCookie("token");

  return res.json({
    success: true,
    message: "Logged out successfully.",
  });
});

/**
 * GET /api/auth/me
 */
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await userQueries.getById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found.",
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
        lastLoginAt: user.last_login_at,
      },
    });
  } catch (err) {
    console.error("Profile error:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to retrieve user profile.",
    });
  }
});

/**
 * PATCH /api/auth/change-password
 */
router.patch("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Both current password and new password are required.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters long.",
      });
    }

    const user = await userQueries.getByIdWithPassword(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found.",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: "Incorrect current password.",
      });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    const result = await userQueries.updatePassword(newHash, req.user.id);

    if (result.rowCount !== 1) {
      return res.status(500).json({
        success: false,
        error: "Password was not updated in database.",
      });
    }

    return res.json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (err) {
    console.error("Password change error:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to update password.",
    });
  }
});

/**
 * POST /api/auth/google
 * Google Sign-In with ID token verification
 */
router.post("/google", async (req, res) => {
  try {
    const { id_token } = req.body;

    // Validate input
    if (!id_token || typeof id_token !== "string") {
      return res.status(400).json({
        success: false,
        error: "Google ID token is required.",
      });
    }

    // Verify the Google ID token
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (verifyErr) {
      console.error("Google ID token verification failed:", verifyErr.message);
      return res.status(401).json({
        success: false,
        error: "Invalid Google ID token.",
      });
    }

    const payload = ticket.getPayload();

    // Validate required claims
    if (!payload.sub) {
      return res.status(401).json({
        success: false,
        error: "Invalid token: missing subject claim.",
      });
    }

    if (!payload.email) {
      return res.status(401).json({
        success: false,
        error: "Invalid token: missing email claim.",
      });
    }

    if (payload.email_verified !== true) {
      return res.status(401).json({
        success: false,
        error: "Google email is not verified.",
      });
    }

    // Check audience matches our client ID
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({
        success: false,
        error: "Token audience mismatch.",
      });
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase().trim();
    const name = payload.name || "";
    const picture = payload.picture || null;

    // 1. First, try to find user by Google ID
    let user = await userQueries.getByGoogleId(googleId);

    if (user) {
      // Existing Google user - update last_login_at and issue JWT
      await userQueries.updateLastLogin(user.id);

      const token = generateToken(user);

      // Set httpOnly cookie (same as existing login)
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        success: true,
        message: "Signed in with Google successfully.",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at,
        },
        token,
      });
    }

    // 2. Google ID not found - check if email exists with email/password account
    const existingByEmail = await userQueries.getByEmail(email);

    if (existingByEmail) {
      // Email exists but with email/password auth - do NOT auto-link
      return res.status(409).json({
        success: false,
        error:
          "An account with this email already exists. Please sign in with your password.",
      });
    }

    // 3. No existing account - create new Google user
    // Generate a valid username from email/name
    const baseUsername = (name || email.split("@")[0])
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .substring(0, 30);

    let username = baseUsername || "user";
    let counter = 1;

    // Ensure username is unique
    while (await userQueries.getByUsername(username)) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    // Create Google user (password_hash = NULL, auth_provider = 'google')
    user = await userQueries.createGoogleUser(
      username,
      email,
      googleId,
      picture,
    );

    // Update last_login_at for new user
    await userQueries.updateLastLogin(user.id);

    // Generate JWT (same as existing login)
    const token = generateToken(user);

    // Set httpOnly cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      message: "Account created and signed in with Google successfully.",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
      },
      token,
    });
  } catch (err) {
    console.error("Google Sign-In error:", err);

    // Handle unique constraint violations (race conditions)
    if (err.code === "23505") {
      // unique_violation
      if (err.constraint === "users_email_key") {
        return res.status(409).json({
          success: false,
          error: "An account with this email already exists.",
        });
      }
      if (err.constraint === "users_username_key") {
        return res.status(409).json({
          success: false,
          error: "Username conflict. Please try again.",
        });
      }
      if (err.constraint === "users_google_id_key") {
        return res.status(409).json({
          success: false,
          error: "This Google account is already linked.",
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: "An unexpected error occurred during Google sign-in.",
    });
  }
});

/**
 * Escape HTML for safe embedding in callback pages
 */
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Get base URL from full redirect URI
 */
function getBaseUrl(fullUrl) {
  const match = fullUrl.match(/^(https?:\/\/[^\/]+)/);
  return match ? match[1] : "https://aegis-ai-chatbot.onrender.com";
}

/**
 * Generate a standard error page for callback
 */
function makeErrorPage(title, message) {
  return `
        <!DOCTYPE html>
        <html>
        <head><title>${escapeHtml(title)}</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; background: #f5f5f5;">
            <div style="text-align: center; max-width: 400px;">
                <h1 style="font-size: 20px; margin-bottom: 12px;">${escapeHtml(title)}</h1>
                <p style="color: #666; margin-bottom: 20px;">${escapeHtml(message)}</p>
                <a href="${escapeHtml(getBaseUrl(GOOGLE_REDIRECT_URI))}"
                   style="display: inline-block; padding: 10px 20px; background: #007AFF; color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">
                    Return to AegisAI
                </a>
            </div>
        </body>
        </html>
    `;
}

// HTML page templates for Google OAuth callback
const signingInPage = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Signing you in...</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { text-align: center; max-width: 400px; }
            h1 { font-size: 20px; margin-bottom: 12px; color: #333; }
            p { color: #666; margin-bottom: 20px; }
            .spinner { width: 40px; height: 40px; border: 3px solid #e0e0e0; border-top-color: #007AFF; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
            @keyframes spin { to { transform: rotate(360deg); } }
            .instructions { background: #e8f4fd; padding: 15px; border-radius: 8px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Signing you in...</h1>
            <p>Please return to AegisAI to continue.</p>
            <div class="spinner"></div>
            <div class="instructions">
                <p><strong>Don't close this window yet.</strong></p>
                <p>AegisAI is signing you in with your Google account.</p>
                <p>Return to the app now.</p>
            </div>
        </div>
    </body>
    </html>
`;

const accountCreatedPage = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Account Created - Signing in...</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; background: #f5f5f5; }
            .container { text-align: center; max-width: 400px; }
            h1 { font-size: 20px; margin-bottom: 12px; color: #333; }
            p { color: #666; margin-bottom: 20px; }
            .spinner { width: 40px; height: 40px; border: 3px solid #e0e0e0; border-top-color: #007AFF; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
            @keyframes spin { to { transform: rotate(360deg); } }
            .instructions { background: #e8f4fd; padding: 15px; border-radius: 8px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Account Created!</h1>
            <p>Your AegisAI account has been created with Google.</p>
            <div class="spinner"></div>
            <div class="instructions">
                <p><strong>Don't close this window yet.</strong></p>
                <p>AegisAI is signing you in. Return to the app now.</p>
            </div>
        </div>
    </body>
    </html>
`;

const emailExistsPage = `
    <!DOCTYPE html>
    <html>
    <head><title>Email Already Registered</title></head>
    <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; background: #f5f5f5;">
        <div style="text-align: center; max-width: 400px;">
            <h1 style="font-size: 20px; margin-bottom: 12px;">Email Already Registered</h1>
            <p style="color: #666; margin-bottom: 20px;">This email is already associated with an AegisAI account.</p>
            <p style="font-size: 14px; background: #fff3cd; padding: 10px; border-radius: 6px; margin-bottom: 20px;">Please sign in with your email and password, or contact support if you need to link accounts.</p>
            <a href="${getBaseUrl(GOOGLE_REDIRECT_URI)}"
               style="display: inline-block; padding: 10px 20px; background: #007AFF; color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">
                Return to AegisAI
            </a>
        </div>
    </body>
    </html>
`;

/**
 * GET /api/auth/google/callback
 * Google OAuth callback - exchange code, verify ID token, create session
 * Lifecycle: pending -> processing -> completed/failed
 */
router.get("/google/callback", async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      const loginCode = state;
      const codeEntry = loginCodes.get(loginCode);
      if (codeEntry && !codeEntry.consumed) {
        codeEntry.status = "failed";
        codeEntry.consumed = true;
        delete codeEntry.token;
        delete codeEntry.user;
      }
      return res
        .status(400)
        .send(makeErrorPage("Google Sign-In Cancelled", oauthError));
    }

    if (!code || !state) {
      return res
        .status(400)
        .send(
          makeErrorPage(
            "Invalid Request",
            "Missing authorization code or state parameter.",
          ),
        );
    }

    const loginCode = state;
    const codeEntry = loginCodes.get(loginCode);

    if (!codeEntry) {
      return res
        .status(400)
        .send(
          makeErrorPage(
            "Session Not Found",
            "This sign-in session could not be found. Please try again.",
          ),
        );
    }

    if (codeEntry.expiresAt_ms <= Date.now()) {
      codeEntry.status = "failed";
      codeEntry.consumed = true;
      delete codeEntry.token;
      delete codeEntry.user;
      return res
        .status(400)
        .send(
          makeErrorPage(
            "Session Expired",
            "This sign-in session has expired. Please try again.",
          ),
        );
    }

    if (codeEntry.consumed) {
      if (codeEntry.status === "completed") {
        return res.status(200).send(signingInPage);
      }
      return res
        .status(400)
        .send(
          makeErrorPage(
            "Session Already Used",
            "This sign-in session has already been used. Please try again.",
          ),
        );
    }

    codeEntry.status = "processing";

    let tokens;
    try {
      tokens = await googleClient.getTokenAsync({
        code: code,
        codeVerifier: codeEntry.verifier,
      });
    } catch (exchangeErr) {
      console.error("Google token exchange error:", exchangeErr);
      codeEntry.status = "failed";
      codeEntry.consumed = true;
      delete codeEntry.token;
      delete codeEntry.user;
      return res
        .status(400)
        .send(
          makeErrorPage(
            "Authentication Failed",
            "Could not complete Google authentication. Please try again.",
          ),
        );
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: tokens.tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.error("Google ID token verification error:", verifyErr);
      codeEntry.status = "failed";
      codeEntry.consumed = true;
      delete codeEntry.token;
      delete codeEntry.user;
      return res
        .status(400)
        .send(
          makeErrorPage(
            "Authentication Failed",
            "Could not verify Google identity. Please try again.",
          ),
        );
    }

    if (!payload) {
      codeEntry.status = "failed";
      codeEntry.consumed = true;
      delete codeEntry.token;
      delete codeEntry.user;
      return res
        .status(400)
        .send(
          makeErrorPage(
            "Authentication Failed",
            "Invalid Google identity token.",
          ),
        );
    }

    const { sub, email: rawEmail, email_verified } = payload;
    const cleanEmail = rawEmail?.toLowerCase().trim();

    if (!sub || !cleanEmail) {
      codeEntry.status = "failed";
      codeEntry.consumed = true;
      delete codeEntry.token;
      delete codeEntry.user;
      return res
        .status(400)
        .send(
          makeErrorPage(
            "Invalid Identity",
            "Google did not provide required identity information.",
          ),
        );
    }

    if (!email_verified) {
      codeEntry.status = "failed";
      codeEntry.consumed = true;
      delete codeEntry.token;
      delete codeEntry.user;
      return res
        .status(400)
        .send(
          makeErrorPage(
            "Email Not Verified",
            "Please verify your Google email address and try again.",
          ),
        );
    }

    if (process.env.GOOGLE_ALLOWED_DOMAINS) {
      const allowedDomains = process.env.GOOGLE_ALLOWED_DOMAINS.split(",").map(
        (d) => d.trim().toLowerCase(),
      );
      const userDomain = cleanEmail.split("@")[1];
      if (!userDomain || !allowedDomains.includes(userDomain)) {
        codeEntry.status = "failed";
        codeEntry.consumed = true;
        delete codeEntry.token;
        delete codeEntry.user;
        return res
          .status(403)
          .send(
            makeErrorPage(
              "Domain Not Allowed",
              "This email domain is not authorized to sign in.",
            ),
          );
      }
    }

    const returnUrl =
      "aegisaiapp:///oauth2callback?loginCode=" + encodeURIComponent(loginCode);

    let user = await userQueries.getByGoogleId(sub);

    if (user) {
      const token = generateToken(user);
      codeEntry.status = "completed";
      codeEntry.token = token;
      codeEntry.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatar_url,
        authProvider: user.auth_provider,
      };
      return res.redirect(returnUrl);
    }

    const existingByEmail = await userQueries.getByEmail(cleanEmail);

    if (existingByEmail) {
      codeEntry.status = "failed";
      codeEntry.consumed = true;
      delete codeEntry.token;
      delete codeEntry.user;
      return res.status(409).send(emailExistsPage);
    }

    try {
      const avatarUrl = payload.picture || null;

      let username = cleanEmail.split("@")[0];
      username = username.replace(/[^a-zA-Z0-9_]/g, "").substring(0, 30);
      if (username.length < 3) {
        username = "user" + Math.random().toString(36).substring(2, 8);
      }

      let baseUsername = username;
      let counter = 1;
      while (await userQueries.getByUsername(username)) {
        username = baseUsername + counter.toString();
        counter++;
      }

      const newUser = await userQueries.createGoogleUser({
        google_id: sub,
        email: cleanEmail,
        username: username,
        avatar_url: avatarUrl,
      });

      const token = generateToken(newUser);
      codeEntry.status = "completed";
      codeEntry.token = token;
      codeEntry.user = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        avatarUrl: newUser.avatar_url,
        authProvider: newUser.auth_provider,
      };

      return res.redirect(returnUrl);
    } catch (createErr) {
      console.error("Google user creation error:", createErr);
      codeEntry.status = "failed";
      codeEntry.consumed = true;
      delete codeEntry.token;
      delete codeEntry.user;
      return res
        .status(500)
        .send(
          makeErrorPage(
            "Account Creation Failed",
            "Could not create your account. Please try again.",
          ),
        );
    }
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res
      .status(500)
      .send(
        makeErrorPage(
          "Server Error",
          "An unexpected error occurred. Please try again.",
        ),
      );
  }
});

/**
 * POST /api/auth/google/status
 * Check status of Google OAuth flow - poll from mobile app
 * Lifecycle: pending/processing -> completed (consumed on success) / failed (consumed)
 */
router.post("/google/status", async (req, res) => {
  try {
    const { loginCode } = req.body;

    if (!loginCode) {
      return res.status(400).json({
        success: false,
        error: "Login code is required.",
      });
    }

    const codeEntry = loginCodes.get(loginCode);

    if (!codeEntry) {
      return res.status(404).json({
        success: false,
        error: "Invalid or expired login code.",
      });
    }

    if (codeEntry.expiresAt_ms <= Date.now()) {
      loginCodes.delete(loginCode);
      return res.status(410).json({
        success: false,
        error:
          "Login code has expired. Please start the sign-in process again.",
      });
    }

    if (
      !codeEntry.status ||
      codeEntry.status === "pending" ||
      codeEntry.status === "processing"
    ) {
      return res.status(202).json({
        success: false,
        status: "pending",
        message: "Authentication in progress. Please continue in the browser.",
      });
    }

    if (codeEntry.status === "completed" && codeEntry.token && codeEntry.user) {
      const token = codeEntry.token;
      const user = codeEntry.user;
      loginCodes.delete(loginCode);

      return res.json({
        success: true,
        message: "Google Sign-In successful.",
        user,
        token,
      });
    }

    if (codeEntry.status === "failed") {
      loginCodes.delete(loginCode);
      return res.status(400).json({
        success: false,
        error: "Google Sign-In failed. Please try again.",
      });
    }

    loginCodes.delete(loginCode);
    return res.status(400).json({
      success: false,
      error: "Invalid login code state.",
    });
  } catch (err) {
    console.error("Google OAuth status error:", err);
    res.status(500).json({
      success: false,
      error: "An error occurred checking sign-in status.",
    });
  }
});

module.exports = router;

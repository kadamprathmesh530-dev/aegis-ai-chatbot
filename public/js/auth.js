/**
 * Aegis AI - Authentication Controller
 * Handles user sign in, registration, session checks, and profile management
 */

let currentUser = null;
let googleSignInInitStarted = false;

function switchAuthTab(tab) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginBtn = document.getElementById('tab-login-btn');
  const registerBtn = document.getElementById('tab-register-btn');
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');

  if (loginError) loginError.classList.remove('active');
  if (registerError) registerError.classList.remove('active');

  if (tab === 'login') {
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    loginBtn.classList.add('active');
    registerBtn.classList.remove('active');
    document.getElementById('login-identifier')?.focus();
  } else {
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
    registerBtn.classList.add('active');
    loginBtn.classList.remove('active');
    document.getElementById('reg-username')?.focus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const registerBtn = document.getElementById('tab-register-btn');
  const loginBtn = document.getElementById('tab-login-btn');

  if (registerBtn) {
    registerBtn.addEventListener('click', () => {
      switchAuthTab('register');
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      switchAuthTab('login');
    });
  }

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }

  // Google Sign-In is initialized via onload handler on the script tag
  // initGoogleSignIn() is called when Google Identity Services script loads
});

const googleScript = document.getElementById('google-gsi-script');

if (googleScript) {
    if (window.google?.accounts?.id) {
        initGoogleSignIn();
    } else {
        googleScript.addEventListener('load', () => {
            initGoogleSignIn();
        }, { once: true });
    }
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const icon = input.parentElement.querySelector('.toggle-password i');

  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.className = 'fa-regular fa-eye-slash';
  } else {
    input.type = 'password';
    if (icon) icon.className = 'fa-regular fa-eye';
  }
}

function checkPasswordStrength(password) {
  const bar = document.getElementById('strength-bar');
  const text = document.getElementById('strength-text');

  if (!bar || !text) return;

  if (!password) {
    bar.style.width = '0%';
    bar.style.backgroundColor = 'transparent';
    text.textContent = 'Password strength';
    return;
  }

  let score = 0;

  if (password.length >= 6) score += 25;
  if (password.length >= 10) score += 25;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 25;
  if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 25;

  bar.style.width = `${score}%`;

  if (score <= 25) {
    bar.style.backgroundColor = 'var(--danger)';
    text.textContent = 'Weak password';
    text.style.color = 'var(--danger)';
  } else if (score <= 75) {
    bar.style.backgroundColor = 'var(--warning)';
    text.textContent = 'Moderate password';
    text.style.color = 'var(--warning)';
  } else {
    bar.style.backgroundColor = 'var(--success)';
    text.textContent = 'Strong password';
    text.style.color = 'var(--success)';
  }
}

async function handleLogin(e) {
  e.preventDefault();

  const identifier = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;
  const errorBox = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');

  if (!identifier || !password) {
    showFormError(
      errorBox,
      'Please enter both your email/username and password.'
    );
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML =
    '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing In...';

  hideFormError(errorBox);

  try {
    const res = await API.login(identifier, password);

    API.setToken(res.token);
    API.setUser(res.user);

    currentUser = res.user;

    showToast(`Welcome back, ${currentUser.username}!`, 'success');

    transitionToApp();
  } catch (err) {
    showFormError(errorBox, err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML =
      '<span>Sign In</span> <i class="fa-solid fa-arrow-right"></i>';
  }
}

async function handleRegister(e) {
  e.preventDefault();

  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirmPassword =
    document.getElementById('reg-confirm-password').value;

  const errorBox = document.getElementById('register-error');
  const submitBtn = document.getElementById('register-submit-btn');

  if (password !== confirmPassword) {
    showFormError(
      errorBox,
      'Passwords do not match. Please verify and retype.'
    );
    return;
  }

  if (password.length < 6) {
    showFormError(
      errorBox,
      'Password must be at least 6 characters long.'
    );
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML =
    '<i class="fa-solid fa-circle-notch fa-spin"></i> Creating Account...';

  hideFormError(errorBox);

  try {
    const res = await API.register(username, email, password);

    API.setToken(res.token);
    API.setUser(res.user);

    currentUser = res.user;

    showToast(
      `Account created successfully! Welcome, ${currentUser.username}.`,
      'success'
    );

    transitionToApp();
  } catch (err) {
    showFormError(errorBox, err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML =
      '<span>Create Secure Account</span> <i class="fa-solid fa-shield-halved"></i>';
  }
}

async function handleLogout() {
  try {
    await API.logout();
  } catch (e) {
    console.warn('Logout notice:', e);
  } finally {
    currentUser = null;

    API.clearSession();

    showToast('You have been signed out.', 'info');

    showAuthScreen();
  }
}

function showFormError(el, msg) {
  if (!el) return;

  el.textContent = msg;
  el.classList.add('active');
}

function hideFormError(el) {
  if (!el) return;

  el.textContent = '';
  el.classList.remove('active');
}

function showAuthScreen() {
  document.getElementById('auth-view').classList.add('active');
  document.getElementById('app-view').classList.remove('active');
}

function transitionToApp() {
  document.getElementById('auth-view').classList.remove('active');
  document.getElementById('app-view').classList.add('active');

  updateUserInterface();
  loadConversationsList();
}

/**
 * Updates all UI elements that depend on the logged-in user.
 */
function updateUserInterface() {
  // Use currentUser first.
  // If it is not available yet, use the saved session user.
  if (!currentUser && typeof API !== 'undefined' && API.getUser) {
    currentUser = API.getUser();
  }

  if (!currentUser) return;

  const username = currentUser.username || 'User';

  const usernameEl = document.getElementById('sidebar-username');
  const userRoleEl = document.getElementById('sidebar-user-role');
  const avatarInitialsEl = document.getElementById('sidebar-user-initials');
  const welcomeTitle = document.getElementById('welcome-title');

  const adminBtns = document.querySelectorAll('.admin-only-btn');

  // Sidebar username
  if (usernameEl) {
    usernameEl.textContent = username;
  }

  // Sidebar role
  if (userRoleEl) {
    userRoleEl.textContent =
      currentUser.role === 'admin'
        ? '🛡️ Administrator'
        : '👤 User';
  }

  // Avatar initials
  if (avatarInitialsEl) {
    avatarInitialsEl.textContent = username
      .substring(0, 2)
      .toUpperCase();
  }

  // Main welcome heading
  if (welcomeTitle) {
    welcomeTitle.textContent = `Hello, ${username}`;
  }

  // Admin buttons
  const isAdmin = currentUser.role === 'admin';

  adminBtns.forEach(btn => {
    btn.style.display = isAdmin ? 'inline-flex' : 'none';
  });
}

function openProfileModal() {
  if (!currentUser) return;

  document.getElementById('prof-username').textContent =
    currentUser.username;

  document.getElementById('prof-email').textContent =
    currentUser.email;

  const roleEl = document.getElementById('prof-role');

  roleEl.textContent = currentUser.role.toUpperCase();
  roleEl.className = `role-badge ${currentUser.role}`;

  document.getElementById('prof-created').textContent =
    currentUser.createdAt
      ? new Date(currentUser.createdAt).toLocaleDateString()
      : 'Active Session';

  const modal = document.getElementById('profile-modal');

  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal');

  if (modal) {
    modal.style.display = 'none';
  }

  const cpError = document.getElementById('cp-error');

  if (cpError) {
    hideFormError(cpError);
  }

  document.getElementById('change-password-form')?.reset();
}

function closeProfileModalOnBackdrop(e) {
  if (e.target.id === 'profile-modal') {
    closeProfileModal();
  }
}

async function handleChangePassword(e) {
  e.preventDefault();

  const currentPassword =
    document.getElementById('cp-current').value;

  const newPassword =
    document.getElementById('cp-new').value;

  const confirmPassword =
    document.getElementById('cp-confirm').value;

  const errorBox =
    document.getElementById('cp-error');

  if (newPassword !== confirmPassword) {
    showFormError(errorBox, 'New passwords do not match.');
    return;
  }

  try {
    await API.changePassword(
      currentPassword,
      newPassword
    );

    showToast(
      'Password updated successfully!',
      'success'
    );

    closeProfileModal();
  } catch (err) {
    showFormError(errorBox, err.message);
  }
}

/**
 * Initialize Google Sign-In button
 * Fetches Google Client ID from server and sets up the GIS button
 */
async function initGoogleSignIn() {
    if (googleSignInInitStarted) return;
    googleSignInInitStarted = true;

    const googleBtn = document.getElementById('google-signin-btn');
    const loginError = document.getElementById('login-error');


  if (!googleBtn) return;

  // Check if Google Identity Services is loaded
  if (!window.google || !window.google.accounts) {
    console.warn('Google Identity Services not loaded');
    return;
  }

  try {
    // Fetch Google Client ID from server config
    const configRes = await fetch('/api/auth/config/google');
    const config = await configRes.json();

    if (!config.googleClientId) {
    console.warn('Google Sign-In not configured:', config.error);
    return;
}

    const googleClientId = config.googleClientId;

    // Initialize Google Identity Services
    google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    // Render the Google Sign-In button
    google.accounts.id.renderButton(googleBtn, {
      theme: 'outline',
      size: 'large',
      width: '400%',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left'
    });

    // Show the button
    googleBtn.style.display = 'flex';

  } catch (err) {
    console.error('Failed to initialize Google Sign-In:', err);
  }
}

/**
 * Handle Google Sign-In credential response
 * @param {Object} response - The credential response from Google
 */
async function handleGoogleCredentialResponse(response) {
  const loginError = document.getElementById('login-error');
  const googleBtn = document.getElementById('google-signin-btn');

  if (!response.credential) {
    showFormError(loginError, 'Google Sign-In failed. No credential received.');
    return;
  }

  // Disable button and show loading state
  if (googleBtn) {
    googleBtn.disabled = true;
    googleBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing in...';
  }

  hideFormError(loginError);

  try {
    // Send ID token to backend for verification
    const res = await API.googleSignIn(response.credential);

    // Store token and user
    API.setToken(res.token);
    API.setUser(res.user);
    currentUser = res.user;

    showToast(`Welcome${res.message.includes('created') ? '' : ' back'}, ${currentUser.username}!`, 'success');

    transitionToApp();
  } catch (err) {
    showFormError(loginError, err.message);
  } finally {
    // Re-enable button
    if (googleBtn) {
      googleBtn.disabled = false;
      googleBtn.innerHTML = `
        <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        <span>Continue with Google</span>
      `;
    }
  }
}

function setupGoogleSignIn() {
    const googleScript = document.getElementById('google-gsi-script');

    if (window.google?.accounts?.id) {
        initGoogleSignIn();
        return;
    }

    if (googleScript) {
        googleScript.addEventListener('load', () => {
            initGoogleSignIn();
        }, { once: true });
    }
}

document.addEventListener('DOMContentLoaded', setupGoogleSignIn);
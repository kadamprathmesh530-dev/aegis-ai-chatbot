/**
 * Aegis AI - Authentication Controller
 * Handles user sign in, registration, session checks, and profile management
 */

let currentUser = null;

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
});

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
    showFormError(errorBox, 'Please enter both your email/username and password.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing In...';
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
    submitBtn.innerHTML = '<span>Sign In</span> <i class="fa-solid fa-arrow-right"></i>';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm-password').value;
  const errorBox = document.getElementById('register-error');
  const submitBtn = document.getElementById('register-submit-btn');

  if (password !== confirmPassword) {
    showFormError(errorBox, 'Passwords do not match. Please verify and retype.');
    return;
  }

  if (password.length < 6) {
    showFormError(errorBox, 'Password must be at least 6 characters long.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Creating Account...';
  hideFormError(errorBox);

  try {
    const res = await API.register(username, email, password);
    API.setToken(res.token);
    API.setUser(res.user);
    currentUser = res.user;

    showToast(`Account created successfully! Welcome, ${currentUser.username}.`, 'success');
    transitionToApp();
  } catch (err) {
    showFormError(errorBox, err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Create Secure Account</span> <i class="fa-solid fa-shield-halved"></i>';
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

function updateUserInterface() {
  if (!currentUser) return;

  const usernameEl = document.getElementById('sidebar-username');
  const userRoleEl = document.getElementById('sidebar-user-role');
  const avatarInitialsEl = document.getElementById('sidebar-user-initials');
  const adminBtns = document.querySelectorAll('.admin-only-btn');

  if (usernameEl) usernameEl.textContent = currentUser.username;
  if (userRoleEl) userRoleEl.textContent = currentUser.role === 'admin' ? '🛡️ Administrator' : '👤 User';
  if (avatarInitialsEl) avatarInitialsEl.textContent = (currentUser.username || 'U').substring(0, 2).toUpperCase();

  // Show or hide admin buttons based on role
  const isAdmin = currentUser.role === 'admin';
  adminBtns.forEach(btn => {
    btn.style.display = isAdmin ? 'inline-flex' : 'none';
  });
}

function openProfileModal() {
  if (!currentUser) return;

  document.getElementById('prof-username').textContent = currentUser.username;
  document.getElementById('prof-email').textContent = currentUser.email;
  
  const roleEl = document.getElementById('prof-role');
  roleEl.textContent = currentUser.role.toUpperCase();
  roleEl.className = `role-badge ${currentUser.role}`;

  document.getElementById('prof-created').textContent = currentUser.createdAt 
    ? new Date(currentUser.createdAt).toLocaleDateString()
    : 'Active Session';

  const modal = document.getElementById('profile-modal');
  if (modal) modal.style.display = 'flex';
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (modal) modal.style.display = 'none';
  const cpError = document.getElementById('cp-error');
  if (cpError) hideFormError(cpError);
  document.getElementById('change-password-form')?.reset();
}

function closeProfileModalOnBackdrop(e) {
  if (e.target.id === 'profile-modal') {
    closeProfileModal();
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('cp-current').value;
  const newPassword = document.getElementById('cp-new').value;
  const confirmPassword = document.getElementById('cp-confirm').value;
  const errorBox = document.getElementById('cp-error');

  if (newPassword !== confirmPassword) {
    showFormError(errorBox, 'New passwords do not match.');
    return;
  }

  try {
    await API.changePassword(currentPassword, newPassword);
    showToast('Password updated successfully!', 'success');
    closeProfileModal();
  } catch (err) {
    showFormError(errorBox, err.message);
  }
}


/**
 * Aegis AI - Main Application Controller
 * Handles application boot, theme switching, responsive sidebar, and toast alerts
 */

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await initSession();
  initShortcuts();
});

/**
 * Initialize and verify active user session on app launch
 */
async function initSession() {
  const token = API.getToken();
  if (!token) {
    showAuthScreen();
    return;
  }

  try {
    const res = await API.getMe();
    if (res.success && res.user) {
      currentUser = res.user;
      API.setUser(res.user);
      transitionToApp();
    } else {
      showAuthScreen();
    }
  } catch (err) {
    console.warn('Session verification failed, requesting login:', err);
    API.clearSession();
    showAuthScreen();
  }
}

/**
 * Theme Management (Dark / Light)
 */
function initTheme() {
  const savedTheme = localStorage.getItem('aegis_theme') || 'theme-dark';
  document.body.className = savedTheme;
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const isDark = document.body.classList.contains('theme-dark');
  const newTheme = isDark ? 'theme-light' : 'theme-dark';
  document.body.className = newTheme;
  localStorage.setItem('aegis_theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (!icon) return;
  if (theme === 'theme-light') {
    icon.className = 'fa-solid fa-moon';
  } else {
    icon.className = 'fa-solid fa-sun';
  }
}

/**
 * Mobile Sidebar Drawer Toggle
 */
function toggleSidebar(open) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar || !backdrop) return;

  if (open) {
    sidebar.classList.add('open');
    backdrop.classList.add('active');
  } else {
    sidebar.classList.remove('open');
    backdrop.classList.remove('active');
  }
}

/**
 * Toast Notification System
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconClass = 'fa-solid fa-circle-info';
  if (type === 'success') iconClass = 'fa-solid fa-circle-check';
  if (type === 'error') iconClass = 'fa-solid fa-triangle-exclamation';

  toast.innerHTML = `
    <i class="${iconClass}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Global Keyboard Shortcuts
 */
function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    // ESC closes open modals
    if (e.key === 'Escape') {
      const inspectModal = document.getElementById('admin-inspect-modal');
      const profileModal = document.getElementById('profile-modal');
      if (inspectModal && inspectModal.style.display === 'flex') closeInspectModal();
      if (profileModal && profileModal.style.display === 'flex') closeProfileModal();
      toggleSidebar(false);
    }

    // Ctrl/Cmd + K starts a new chat
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (document.getElementById('app-view').classList.contains('active')) {
        startNewChat();
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {

    // Authentication
    document.getElementById('tab-login-btn')?.addEventListener('click', () => switchAuthTab('login'));
    document.getElementById('tab-register-btn')?.addEventListener('click', () => switchAuthTab('register'));
    document.getElementById('create-account-link')?.addEventListener('click', () => switchAuthTab('register'));
    document.getElementById('sign-in-link')?.addEventListener('click', () => switchAuthTab('login'));

    // Sidebar
    document.getElementById('sidebar-backdrop')?.addEventListener('click', () => toggleSidebar(false));
    document.getElementById('close-sidebar-btn')?.addEventListener('click', () => toggleSidebar(false));
    document.getElementById('open-menu-btn')?.addEventListener('click', () => toggleSidebar(true));
    document.getElementById('new-chat-btn')?.addEventListener('click', () => startNewChat());

    // Sidebar actions
    document.getElementById('sidebar-admin-btn')?.addEventListener('click', () => openAdminView());
    document.getElementById('sidebar-logout-btn')?.addEventListener('click', () => handleLogout());
    document.getElementById('rename-conversation-btn')?.addEventListener('click', () => promptRenameConversation());

    // Profile & theme
    document.getElementById('user-profile-card')?.addEventListener('click', () => openProfileModal());
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => toggleTheme());

    // Header admin
    document.getElementById('header-admin-btn')?.addEventListener('click', () => openAdminView());

    // Suggested prompts
    document.getElementById('suggest-security')?.addEventListener('click', () =>
        sendSuggestedPrompt('Explain how secure user authentication and bcrypt work')
    );

    document.getElementById('suggest-code')?.addEventListener('click', () =>
        sendSuggestedPrompt('Write a clean JavaScript API service with error handling')
    );

    document.getElementById('suggest-database')?.addEventListener('click', () =>
        sendSuggestedPrompt('How do SQLite WAL mode and foreign key constraints work?')
    );

    document.getElementById('suggest-brainstorm')?.addEventListener('click', () =>
        sendSuggestedPrompt('Help me brainstorm features for a modern AI application')
    );

    // Admin
    document.getElementById('close-admin-btn')?.addEventListener('click', () => closeAdminView());
    document.getElementById('refresh-admin-btn')?.addEventListener('click', () => loadAdminDashboardData());

    // Profile modal
    document.getElementById('profile-modal')?.addEventListener('click', (event) => {
        closeProfileModalOnBackdrop(event);
    });

    document.getElementById('close-profile-modal-btn')?.addEventListener('click', () => closeProfileModal());
    document.getElementById('cancel-profile-modal-btn')?.addEventListener('click', () => closeProfileModal());

    // Admin inspector modal
    document.getElementById('admin-inspect-modal')?.addEventListener('click', (event) => {
        closeInspectModalOnBackdrop(event);
    });

    document.getElementById('close-inspect-modal-btn')?.addEventListener('click', () => closeInspectModal());

});
/**
 * Aegis AI - Admin Dashboard Controller
 * Handles system analytics, user management, and conversation oversight
 */

let adminUsersList = [];
let selectedInspectorUserId = null;

/**
 * Switch view to the Admin Dashboard
 */
async function openAdminView() {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Administrator access required.', 'error');
    return;
  }

  document.getElementById('chat-subview').style.display = 'none';
  document.getElementById('admin-subview').style.display = 'flex';

  await loadAdminDashboardData();
}

/**
 * Return to User Chat view
 */
function closeAdminView() {
  document.getElementById('admin-subview').style.display = 'none';
  document.getElementById('chat-subview').style.display = 'flex';
}

/**
 * Fetch and render all statistics and user data
 */
async function loadAdminDashboardData() {
  try {
    // 1. Fetch Stats
    const statsRes = await API.getAdminStats();
    if (statsRes.success && statsRes.stats) {
      document.getElementById('stat-total-users').textContent = statsRes.stats.total_users || 0;
      document.getElementById('stat-total-conversations').textContent = statsRes.stats.total_conversations || 0;
      document.getElementById('stat-total-messages').textContent = statsRes.stats.total_messages || 0;
      document.getElementById('stat-active-users').textContent = statsRes.stats.active_users_24h || 0;
    }

    // 2. Fetch Users
    const usersRes = await API.getAdminUsers();
    if (usersRes.success && usersRes.users) {
      adminUsersList = usersRes.users;
      renderAdminUsersTable(adminUsersList);
    }
  } catch (err) {
    console.error('Failed to load admin data:', err);
    showToast(err.message, 'error');
  }
}

/**
 * Render the Registered Users table
 */
function renderAdminUsersTable(users) {
  const tbody = document.getElementById('admin-users-tbody');
  const countBadge = document.getElementById('user-count-badge');
  if (!tbody) return;

  if (countBadge) {
    countBadge.textContent = `${users.length} Account${users.length === 1 ? '' : 's'}`;
  }

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-faint); padding: 24px;">
          No matching user accounts found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const isSelf = currentUser && currentUser.id === u.id;
    const regDate = u.created_at ? new Date(u.created_at).toLocaleDateString() : '-';
    const lastActive = u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never';

    return `
      <tr>
        <td><span style="color: var(--text-faint); font-family: var(--font-mono); font-size: 0.78rem;">#${u.id}</span></td>
        <td>
          <div style="display: flex; flex-direction: column;">
            <strong style="color: var(--text-main); font-size: 0.88rem;">${escapeHtml(u.username)} ${isSelf ? '<span style="font-size:0.7rem; color:var(--primary-light);">(You)</span>' : ''}</strong>
            <span style="color: var(--text-muted); font-size: 0.78rem;">${escapeHtml(u.email)}</span>
          </div>
        </td>
        <td>
          <span class="role-badge ${u.role}">
            <i class="${u.role === 'admin' ? 'fa-solid fa-crown' : 'fa-solid fa-user'}"></i>
            ${u.role}
          </span>
        </td>
        <td><span style="color: var(--text-muted); font-size: 0.82rem;">${regDate}</span></td>
        <td><span style="color: var(--text-muted); font-size: 0.82rem;">${lastActive}</span></td>
        <td>
          <span style="font-weight: 600; color: var(--accent-cyan); font-family: var(--font-mono);">
            ${u.conversation_count || 0}
          </span>
        </td>
        <td>
          <span style="font-weight: 600; color: var(--accent-purple); font-family: var(--font-mono);">
            ${u.message_count || 0}
          </span>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn btn-ghost btn-sm" onclick="openConversationInspector(${u.id}, '${escapeHtml(u.username)}', '${escapeHtml(u.email)}')" title="Inspect Conversations">
              <i class="fa-solid fa-eye"></i>
              <span>Inspect</span>
            </button>
            
            ${!isSelf ? `
              <button class="btn btn-ghost btn-sm" onclick="toggleUserRole(${u.id}, '${u.role}', '${escapeHtml(u.username)}')" title="Toggle Role">
                <i class="fa-solid fa-user-shield"></i>
                <span>${u.role === 'admin' ? 'Demote' : 'Make Admin'}</span>
              </button>
              <button class="btn btn-ghost btn-sm" style="color: var(--danger);" onclick="deleteUserAccount(${u.id}, '${escapeHtml(u.username)}')" title="Delete User">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Filter users in table by username or email
 */
function filterAdminUsers(query) {
  const clean = query.toLowerCase().trim();
  if (!clean) {
    renderAdminUsersTable(adminUsersList);
    return;
  }

  const filtered = adminUsersList.filter(u => 
    u.username.toLowerCase().includes(clean) || 
    u.email.toLowerCase().includes(clean)
  );
  renderAdminUsersTable(filtered);
}

/**
 * Toggle user role (user <-> admin)
 */
async function toggleUserRole(userId, currentRole, username) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  const actionText = newRole === 'admin' ? 'promote' : 'demote';

  if (!confirm(`Are you sure you want to ${actionText} "${username}" to "${newRole}"?`)) {
    return;
  }

  try {
    await API.updateAdminUserRole(userId, newRole);
    showToast(`User ${username} role updated to ${newRole}.`, 'success');
    await loadAdminDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Delete a user account and their data
 */
async function deleteUserAccount(userId, username) {
  if (!confirm(`⚠️ CAUTION: Are you sure you want to permanently delete user "${username}"?\n\nAll of their conversations and messages will be permanently deleted.`)) {
    return;
  }

  try {
    await API.deleteAdminUser(userId);
    showToast(`User ${username} and all their conversations deleted.`, 'info');
    await loadAdminDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Open the Conversation Inspector Modal for a specific user
 */
async function openConversationInspector(userId, username, email) {
  selectedInspectorUserId = userId;

  const subtitleEl = document.getElementById('inspect-user-subtitle');
  const threadsContainer = document.getElementById('inspect-threads-container');
  const convTitleEl = document.getElementById('inspect-conv-title');
  const convMetaEl = document.getElementById('inspect-conv-meta');
  const messagesContainer = document.getElementById('inspect-messages-container');

  subtitleEl.textContent = `User: ${username} (${email})`;
  threadsContainer.innerHTML = '<div style="padding:12px; color:var(--text-faint); font-size:0.8rem;">Loading conversations...</div>';
  convTitleEl.textContent = 'Select a conversation';
  convMetaEl.textContent = '';
  messagesContainer.innerHTML = '<div class="inspect-placeholder">Select a thread on the left to inspect full messages.</div>';

  document.getElementById('admin-inspect-modal').style.display = 'flex';

  try {
    const res = await API.getAdminUserConversations(userId);
    const conversations = res.conversations || [];

    if (conversations.length === 0) {
      threadsContainer.innerHTML = '<div style="padding:16px; color:var(--text-faint); font-size:0.82rem; text-align:center;">This user has no conversations.</div>';
      return;
    }

    threadsContainer.innerHTML = conversations.map((c, idx) => `
      <div class="conv-item ${idx === 0 ? 'active' : ''}" 
           onclick="inspectConversationDetails('${c.id}', this)" 
           id="inspect-conv-${c.id}">
        <div class="conv-info">
          <i class="fa-regular fa-message conv-icon"></i>
          <span class="conv-title-text" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</span>
        </div>
      </div>
    `).join('');

    // Automatically inspect first conversation
    if (conversations.length > 0) {
      inspectConversationDetails(conversations[0].id, document.getElementById(`inspect-conv-${conversations[0].id}`));
    }
  } catch (err) {
    threadsContainer.innerHTML = `<div style="padding:12px; color:var(--danger); font-size:0.8rem;">${err.message}</div>`;
  }
}

/**
 * Load full messages transcript for a specific conversation in the inspector
 */
async function inspectConversationDetails(convId, el) {
  document.querySelectorAll('#inspect-threads-container .conv-item').forEach(item => item.classList.remove('active'));
  if (el) el.classList.add('active');

  const convTitleEl = document.getElementById('inspect-conv-title');
  const convMetaEl = document.getElementById('inspect-conv-meta');
  const messagesContainer = document.getElementById('inspect-messages-container');

  messagesContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-faint);">Loading message history...</div>';

  try {
    const res = await API.getAdminConversationMessages(convId);
    convTitleEl.textContent = res.conversation.title;
    convMetaEl.textContent = `Created: ${new Date(res.conversation.created_at).toLocaleString()} | Total Messages: ${res.messages.length}`;

    if (!res.messages || res.messages.length === 0) {
      messagesContainer.innerHTML = '<div class="inspect-placeholder">No messages in this conversation.</div>';
      return;
    }

    messagesContainer.innerHTML = res.messages.map(msg => {
      const isUser = msg.role === 'user';
      const rendered = isUser ? escapeHtml(msg.content) : (typeof marked !== 'undefined' ? marked.parse(msg.content) : escapeHtml(msg.content));
      const timeStr = new Date(msg.created_at).toLocaleString();

      return `
        <div class="chat-message ${isUser ? 'user-message' : 'bot-message'}">
          <div class="message-avatar">
            <i class="${isUser ? 'fa-solid fa-user' : 'fa-solid fa-brain'}"></i>
          </div>
          <div class="message-content-wrapper">
            <div class="message-bubble">${rendered}</div>
            <div class="message-meta">
              <span>${timeStr} (${msg.role})</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Apply syntax highlighting
    if (typeof hljs !== 'undefined') {
      messagesContainer.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  } catch (err) {
    messagesContainer.innerHTML = `<div style="padding:20px; color:var(--danger);">${err.message}</div>`;
  }
}

function closeInspectModal() {
  document.getElementById('admin-inspect-modal').style.display = 'none';
}

function closeInspectModalOnBackdrop(e) {
  if (e.target.id === 'admin-inspect-modal') {
    closeInspectModal();
  }
}


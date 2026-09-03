/**
 * Aegis AI - Chat Controller
 * Handles conversation management, message exchange, markdown rendering, and typing animations
 */

let activeConversationId = null;
let userConversations = [];
let isGenerating = false;
let currentAssistantMessageEl = null;
let currentAssistantContent = '';

// Configure Marked.js with syntax highlighting
if (typeof marked !== 'undefined') {
  marked.setOptions({
    highlight: function(code, lang) {
      if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (e) {
          console.error(e);
        }
      }
      return code;
    },
    breaks: true,
    gfm: true
  });
}

/**
 * Load all conversations belonging to the authenticated user
 */
async function loadConversationsList() {
  const container = document.getElementById('conversations-list');
  if (!container) return;

  try {
    const res = await API.getConversations();
    userConversations = res.conversations || [];
    renderConversationsList(userConversations);

    if (userConversations.length > 0 && !activeConversationId) {
      selectConversation(userConversations[0].id);
    } else if (userConversations.length === 0) {
      startNewChat();
    }
  } catch (err) {
    console.error('Error loading conversations:', err);
    container.innerHTML = '<div style="padding: 12px; color: var(--text-faint); font-size: 0.8rem;">No conversations found.</div>';
  }
}

/**
 * Render the conversation list in the left sidebar
 */
function renderConversationsList(list) {
  const container = document.getElementById('conversations-list');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-faint); font-size: 0.82rem;">No chats yet. Start one!</div>';
    return;
  }

  container.innerHTML = list.map(c => `
    <div class="conv-item ${c.id === activeConversationId ? 'active' : ''}" 
         onclick="selectConversation('${c.id}')" 
         id="conv-item-${c.id}">
      <div class="conv-info">
        <i class="fa-regular fa-message conv-icon"></i>
        <span class="conv-title-text" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</span>
      </div>
      <div class="conv-actions">
        <button class="conv-action-btn" onclick="promptRenameConversation('${c.id}', event)" title="Rename">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="conv-action-btn delete" onclick="handleDeleteConversation('${c.id}', event)" title="Delete">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Filter conversations in the sidebar by title
 */
function filterConversations(query) {
  const cleanQuery = query.toLowerCase().trim();
  if (!cleanQuery) {
    renderConversationsList(userConversations);
    return;
  }

  const filtered = userConversations.filter(c => 
    c.title.toLowerCase().includes(cleanQuery)
  );
  renderConversationsList(filtered);
}

/**
 * Start a brand new blank chat session
 */
function startNewChat() {
  activeConversationId = null;
  
  // Highlight no sidebar item
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));

  // Update header title
  const titleEl = document.getElementById('active-chat-title');
  if (titleEl) titleEl.textContent = 'New Conversation';

  // Clear message feed and show empty state
  const feed = document.getElementById('message-feed');
  const emptyState = document.getElementById('empty-state');
  if (feed) feed.innerHTML = '';
  if (emptyState) emptyState.style.display = 'block';

  // Focus input
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = '';
    autoResizeTextarea(input);
    input.focus();
  }
}

/**
 * Select and load a conversation thread
 */
async function selectConversation(id) {
  if (isGenerating) return;

  activeConversationId = id;

  // Update active class in sidebar
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
  const activeEl = document.getElementById(`conv-item-${id}`);
  if (activeEl) activeEl.classList.add('active');

  const emptyState = document.getElementById('empty-state');
  const feed = document.getElementById('message-feed');
  const titleEl = document.getElementById('active-chat-title');

  try {
    const res = await API.getConversationMessages(id);
    if (titleEl) titleEl.textContent = res.conversation.title;

    if (emptyState) emptyState.style.display = 'none';
    if (feed) feed.innerHTML = '';

    if (res.messages && res.messages.length > 0) {
      res.messages.forEach(msg => {
        appendMessageToFeed(
          msg.role,
          msg.content,
          msg.created_at,
          msg.sources || []
        );
      });
      scrollMessagesToBottom();
    } else {
      if (emptyState) emptyState.style.display = 'block';
    }

    // Close mobile sidebar if open
    toggleSidebar(false);
  } catch (err) {
    console.error('Error opening conversation:', err);
    showToast(err.message, 'error');
  }
}

/**
 * Handle sending a user message (with streaming support)
 */
async function handleSendMessage(e) {
  if (e) e.preventDefault();
  if (isGenerating) return;

  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const emptyState = document.getElementById('empty-state');
  const typingIndicator = document.getElementById('typing-indicator');

  const messageText = input.value.trim();
  if (!messageText) return;

  // 1. Clear input & reset size
  input.value = '';
  autoResizeTextarea(input);

  // 2. Hide empty state
  if (emptyState) emptyState.style.display = 'none';

  // 3. Render user message in feed immediately
  appendMessageToFeed('user', messageText, new Date().toISOString());
  scrollMessagesToBottom();

  // 4. Show typing / reasoning indicator
  isGenerating = true;
  if (sendBtn) sendBtn.disabled = true;
  if (typingIndicator) typingIndicator.style.display = 'flex';
  scrollMessagesToBottom();

  try {
    // Use streaming endpoint
    await API.sendMessageStream(activeConversationId, messageText, handleStreamChunk);

    // Refresh conversation sidebar list to show latest title/order
    await loadConversationsList();
    
    // Ensure active class is set
    const activeEl = document.getElementById(`conv-item-${activeConversationId}`);
    if (activeEl) activeEl.classList.add('active');

  } catch (err) {
    console.error('Error sending message:', err);
    // If there's a partial message, show error
    if (currentAssistantMessageEl) {
      const bubble = currentAssistantMessageEl.querySelector('.message-bubble');
      if (bubble) {
        bubble.innerHTML = `⚠️ **Error:** ${err.message || 'Unable to connect to AI server.'}`;
      }
    } else {
      appendMessageToFeed('assistant', `⚠️ **Error:** ${err.message || 'Unable to connect to AI server.'}`, new Date().toISOString());
    }
    showToast(err.message, 'error');
  } finally {
    isGenerating = false;
    if (sendBtn) sendBtn.disabled = false;
    if (typingIndicator) typingIndicator.style.display = 'none';
    scrollMessagesToBottom();
    input.focus();
    
    // Reset streaming state
    currentAssistantMessageEl = null;
    currentAssistantContent = '';
  }
}

/**
 * Handle streaming chunks from the server
 */
function handleStreamChunk(data) {
  const feed = document.getElementById('message-feed');
  if (!feed) return;

  switch (data.type) {
    case 'user_message':
      // User message already rendered, just track conversation ID
      if (!activeConversationId && data.conversation_id) {
        activeConversationId = data.conversation_id;
      }
      break;

    case 'assistant_start':
      // Create assistant message element
      currentAssistantMessageEl = document.createElement('div');
      currentAssistantMessageEl.className = 'chat-message bot-message';
      currentAssistantContent = '';
      
      const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      currentAssistantMessageEl.innerHTML = `
        <div class="message-avatar">
          <i class="fa-solid fa-brain"></i>
        </div>
        <div class="message-content-wrapper">
          <div class="message-bubble"></div>
          <div class="message-meta">
            <span>${formattedTime}</span>
            <button class="icon-btn-ghost" style="width:20px;height:20px;font-size:0.7rem;" onclick="copyMessageText(this)" title="Copy message"><i class="fa-regular fa-copy"></i></button>
          </div>
        </div>
      `;
      
      feed.appendChild(currentAssistantMessageEl);
      scrollMessagesToBottom();
      break;

    case 'assistant_chunk':
      // Append chunk to current content
      currentAssistantContent += data.content;
      if (currentAssistantMessageEl) {
        const bubble = currentAssistantMessageEl.querySelector('.message-bubble');
        if (bubble && typeof marked !== 'undefined') {
          bubble.innerHTML = marked.parse(currentAssistantContent);
          // Apply syntax highlighting
          if (typeof hljs !== 'undefined') {
            bubble.querySelectorAll('pre code').forEach((block) => {
              hljs.highlightElement(block);
            });
          }
          // Render math
          if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([currentAssistantMessageEl]).catch(() => {});
          }
        }
      }
      scrollMessagesToBottom();
      break;

    case 'assistant_complete':
      // Update conversation ID if new
      if (!activeConversationId && data.conversation_id) {
        activeConversationId = data.conversation_id;
      }
      // Update title if provided
      if (data.updated_title) {
        const titleEl = document.getElementById('active-chat-title');
        if (titleEl) titleEl.textContent = data.updated_title;
      }
      // Final render with sources if any
      if (currentAssistantMessageEl && data.sources && data.sources.length > 0) {
        const wrapper = currentAssistantMessageEl.querySelector('.message-content-wrapper');
        if (wrapper) {
          const sourcesHtml = `
            <div class="web-sources">
              <strong>🌐 Sources</strong>
              ${data.sources.map((source, index) => `
                  <a href="${source.url}" target="_blank" rel="noopener noreferrer">
                      ${index + 1}. ${escapeHtml(source.title || source.url)}
                  </a>
              `).join('')}
            </div>
          `;
          // Insert sources before message-meta
          const meta = wrapper.querySelector('.message-meta');
          if (meta) {
            meta.insertAdjacentHTML('beforebegin', sourcesHtml);
          }
        }
      }
      break;

    case 'error':
      console.error('Stream error:', data.error);
      if (currentAssistantMessageEl) {
        const bubble = currentAssistantMessageEl.querySelector('.message-bubble');
        if (bubble) {
          bubble.innerHTML = `⚠️ **Error:** ${data.error}`;
        }
      } else {
        appendMessageToFeed('assistant', `⚠️ **Error:** ${data.error}`, new Date().toISOString());
      }
      break;
  }
}

/**
 * Append a message bubble to the chat feed
 */
function appendMessageToFeed(role, content, timestamp, sources = []) {
  const feed = document.getElementById('message-feed');
  if (!feed) return;

  const isUser = role === 'user';
  const msgEl = document.createElement('div');
  msgEl.className = `chat-message ${isUser ? 'user-message' : 'bot-message'}`;

  const formattedTime = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const renderedContent = isUser ? escapeHtml(content) : (typeof marked !== 'undefined' ? marked.parse(content) : escapeHtml(content));

  msgEl.innerHTML = `
    <div class="message-avatar">
      <i class="${isUser ? 'fa-solid fa-user' : 'fa-solid fa-brain'}"></i>
    </div>
    <div class="message-content-wrapper">
      <div class="message-bubble">${renderedContent}</div>
      ${!isUser && sources.length ? `
        <div class="web-sources">
          <strong>🌐 Sources</strong>
          ${sources.map((source, index) => `
              <a href="${source.url}" target="_blank" rel="noopener noreferrer">
                  ${index + 1}. ${escapeHtml(source.title || source.url)}
              </a>
          `).join('')}
        </div>
      ` : ''}
      <div class="message-meta">
        <span>${formattedTime}</span>
        ${!isUser ? `<button class="icon-btn-ghost" style="width:20px;height:20px;font-size:0.7rem;" onclick="copyMessageText(this)" title="Copy message"><i class="fa-regular fa-copy"></i></button>` : ''}
      </div>
    </div>
  `;

  feed.appendChild(msgEl);
// Render mathematical formulas with MathJax
if (!isUser) {
  const renderMath = () => {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([msgEl]).catch((error) => {
        console.warn('[MathJax] Rendering failed:', error);
      });
    } else {
      setTimeout(renderMath, 200);
    }
  };

  renderMath();
}
  // Apply syntax highlighting to pre code tags
  if (!isUser && typeof hljs !== 'undefined') {
    msgEl.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
  }
}

/**
 * Send suggested prompt from the empty state cards
 */
function sendSuggestedPrompt(text) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = text;
    handleSendMessage();
  }
}

/**
 * Prompt to rename a conversation
 */
async function promptRenameConversation(id = activeConversationId, e = null) {
  if (e) e.stopPropagation();
  if (!id) return;

  const target = userConversations.find(c => c.id === id);
  const currentTitle = target ? target.title : 'Conversation';

  const newTitle = prompt('Enter a new title for this conversation:', currentTitle);
  if (!newTitle || newTitle.trim() === '' || newTitle.trim() === currentTitle) return;

  try {
    await API.renameConversation(id, newTitle.trim());
    showToast('Conversation renamed.', 'success');
    await loadConversationsList();
    if (id === activeConversationId) {
      const titleEl = document.getElementById('active-chat-title');
      if (titleEl) titleEl.textContent = newTitle.trim();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Delete a conversation
 */
async function handleDeleteConversation(id, e) {
  if (e) e.stopPropagation();
  if (!id) return;

  if (!confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
    return;
  }

  try {
    await API.deleteConversation(id);
    showToast('Conversation deleted.', 'info');
    
    if (id === activeConversationId) {
      startNewChat();
    }
    await loadConversationsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Scroll messages container to the bottom
 */
function scrollMessagesToBottom() {
  const container = document.getElementById('messages-container');
  if (container) {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  }
}

/**
 * Auto resize textarea up to a max height
 */
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
}

/**
 * Handle Enter to send, Shift+Enter for newline
 */
function handleInputKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
}

/**
 * Copy message bubble text to clipboard
 */
function copyMessageText(btn) {
  const bubble = btn.closest('.message-content-wrapper').querySelector('.message-bubble');
  if (!bubble) return;

  navigator.clipboard.writeText(bubble.innerText).then(() => {
    showToast('Message copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy message.', 'error');
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');

    if (chatForm) {
        chatForm.addEventListener('submit', handleSendMessage);
    }

    const chatInput = document.getElementById('chat-input');

    if (chatInput) {
        chatInput.addEventListener('keydown', handleInputKeyDown);
        chatInput.addEventListener('input', () => autoResizeTextarea(chatInput));
    }
});
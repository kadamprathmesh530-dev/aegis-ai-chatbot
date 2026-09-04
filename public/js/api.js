/**
 * Aegis AI - API Service Layer
 * Manages JWT tokens, HTTP requests, error handling, and authorization headers
 */

const API = {
  TOKEN_KEY: 'aegis_auth_token',
  USER_KEY: 'aegis_auth_user',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  setToken(token) {
    if (token) {
      localStorage.setItem(this.TOKEN_KEY, token);
    } else {
      localStorage.removeItem(this.TOKEN_KEY);
    }
  },

  getUser() {
    try {
      const userStr = localStorage.getItem(this.USER_KEY);
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(this.USER_KEY);
    }
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  async request(endpoint, options = {}) {
    const url = `/api${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));

      // Handle 401 Unauthorized globally
      if (response.status === 401) {
        this.clearSession();
        if (typeof showAuthScreen === 'function') {
          showAuthScreen();
        }
        throw new Error(data.error || 'Session expired. Please log in again.');
      }

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      throw err;
    }
  },

  // Auth endpoints
  async register(username, email, password) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
  },

  async login(loginIdentifier, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ loginIdentifier, password })
    });
  },

  async googleSignIn(idToken) {
    return this.request('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken })
    });
  },

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.clearSession();
    }
  },

  async getMe() {
    return this.request('/auth/me');
  },

  async changePassword(currentPassword, newPassword) {
    return this.request('/auth/change-password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  },

  // Conversations endpoints
  async getConversations() {
    return this.request('/conversations');
  },

  async createConversation(title = 'New Conversation') {
    return this.request('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title })
    });
  },

  async getConversationMessages(id) {
    return this.request(`/conversations/${id}`);
  },

  async renameConversation(id, title) {
    return this.request(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title })
    });
  },

  async deleteConversation(id) {
    return this.request(`/conversations/${id}`, {
      method: 'DELETE'
    });
  },

  // Chat endpoint
  async sendMessage(conversationId, message) {
    return this.request('/chat', {
      method: 'POST',
      body: JSON.stringify({ conversationId, message })
    });
  },

  // Streaming chat endpoint
  async sendMessageStream(conversationId, message, onChunk) {
    const url = `/api/chat/stream`;
    const headers = {
      'Content-Type': 'application/json',
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ conversationId, message })
      });

      if (response.status === 401) {
        this.clearSession();
        if (typeof showAuthScreen === 'function') {
          showAuthScreen();
        }
        throw new Error('Session expired. Please log in again.');
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      // Process SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split by double newline (SSE event delimiter)
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // Keep incomplete event in buffer

        for (const event of events) {
          if (event.trim() === '') continue;
          
          // Each event may have multiple lines, find the data: line
          const lines = event.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (onChunk) onChunk(data);
              } catch (e) {
                console.warn('Failed to parse SSE data:', line);
              }
              break; // Only process first data: line per event
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim() && buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6));
          if (onChunk) onChunk(data);
        } catch (e) {
          console.warn('Failed to parse final SSE data:', buffer);
        }
      }

      return { success: true };
    } catch (err) {
      throw err;
    }
  },

  // Admin endpoints
  async getAdminStats() {
    return this.request('/admin/stats');
  },

  async getAdminUsers() {
    return this.request('/admin/users');
  },

  async getAdminUserConversations(userId) {
    return this.request(`/admin/users/${userId}/conversations`);
  },

  async getAdminConversationMessages(conversationId) {
    return this.request(`/admin/conversations/${conversationId}/messages`);
  },

  async updateAdminUserRole(userId, role) {
    return this.request(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    });
  },

  async deleteAdminUser(userId) {
    return this.request(`/admin/users/${userId}`, {
      method: 'DELETE'
    });
  }
};


# 🛡️ Aegis AI - Secure Chatbot Application

A secure, enterprise-grade AI chatbot application featuring robust user authentication, password security (bcrypt), SQLite database persistence, strict data isolation, and an Administrator Dashboard.

---

## 🌟 Features

- **🔐 Secure User Authentication & RBAC**:
  - Sign Up, Login, and Logout functionality.
  - Passwords securely hashed with `bcryptjs` (salt rounds: 12) — **passwords are never stored in plaintext**.
  - Signed JSON Web Tokens (JWT) for session management with HttpOnly cookie and Bearer token support.
  - Server-side Role-Based Access Control (`user` vs `admin`).
- **🗄️ SQLite Database Architecture**:
  - Embedded zero-configuration database (`data/chatbot.db`) with Foreign Key constraints and WAL (Write-Ahead Logging) mode.
  - User accounts, conversation threads, and message transcripts are persisted with atomic ACID transactions and cascade deletion.
- **🛡️ Strict Data Isolation**:
  - Every conversation query enforces user ownership on the database level (`WHERE user_id = ?`).
  - Normal users can never access or modify other users' conversations or administrative endpoints.
- **👑 Dedicated Administrator Dashboard**:
  - Real-time system analytics: Total Users, Total Conversations, Total AI Messages, Active Users (24h).
  - User Management Table: Search and filter registered accounts, manage roles, and delete accounts.
  - **Conversation Inspector**: Allows designated project owners/admins to inspect full conversation threads and transcripts across all registered users with exact timestamps.
- **⚡ AI Chatbot Integration**:
  - Server-side Google Gemini API integration (`gemini-1.5-flash`).
  - Intelligent fallback engine if `GEMINI_API_KEY` is not provided (works 100% out of the box).
  - API keys and secrets stay securely on the server and are never exposed to client-side JavaScript.
- **🎨 Modern Responsive UI**:
  - Dark and Light theme switcher.
  - Markdown message rendering with syntax-highlighted code blocks (Highlight.js).
  - Copy message and code snippet buttons.
  - Auto-expanding message textarea with keyboard shortcuts (`Enter` to send, `Shift+Enter` for newlines).
  - Toast notification alerts and interactive password strength meter.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` (preconfigured with defaults for local testing):
```bash
cp .env.example .env
```

Default credentials seeded on first launch:
- **Admin Email**: `admin@chatbot.local`
- **Admin Password**: `Admin@123456`
- **Google Gemini API Key** *(Optional)*: Set `GEMINI_API_KEY` in `.env` to enable real-time Gemini LLM inference.

### 3. Start the Server
```bash
npm start
```
Open your browser and navigate to: [http://localhost:3000](http://localhost:3000)

---

## 🧪 Running Automated Tests

Run the backend unit and security verification suite:
```bash
npm test
```

Run the HTTP End-to-End API and authorization isolation tests:
```bash
node tests/test-http-api.js
```

---

## 📂 Project Structure

```
chatbot/
├── data/
│   └── chatbot.db               # SQLite database file (auto-generated)
├── public/                      # Responsive frontend SPA
│   ├── css/
│   │   └── styles.css           # Modern theme styling & layout
│   ├── js/
│   │   ├── api.js               # API service & JWT request layer
│   │   ├── auth.js              # Auth controller & profile state
│   │   ├── chat.js              # Chat controller & Markdown rendering
│   │   ├── admin.js             # Admin analytics & conversation inspector
│   │   └── app.js               # App boot, theme switcher & shortcuts
│   └── index.html               # Main SPA view & modals
├── server/                      # Secure Express backend
│   ├── db/
│   │   └── database.js          # SQLite setup, schema, prepared queries & admin seed
│   ├── middleware/
│   │   └── auth.js              # JWT authentication & requireAdmin RBAC
│   ├── routes/
│   │   ├── auth.js              # /api/auth routes (login, register, logout, profile)
│   │   ├── conversations.js     # /api/conversations CRUD with user ownership
│   │   ├── chat.js              # /api/chat AI generation & message persistence
│   │   └── admin.js             # /api/admin stats, users & conversation inspector
│   └── server.js                # Express app entry, security headers (Helmet), CORS & rate limiter
├── tests/
│   ├── test-backend.js          # Unit & DB security tests
│   └── test-http-api.js         # HTTP API & authorization boundary tests
├── .env.example
├── package.json
└── README.md
```

---

## 🔒 Security Architecture Highlights

1. **Password Hashing**: `bcryptjs` with salt round cost 12 ensures that passwords are computationally expensive to brute-force. Plaintext passwords are never stored.
2. **Backend Authorization Enforcement**: All endpoints check `req.user.id` against database records. Hiding UI elements is only done for UX; actual data access rules are strictly enforced by backend middleware.
3. **Secret Isolation**: Secrets like `JWT_SECRET` and `GEMINI_API_KEY` are only loaded into Node process memory via `dotenv` on the server.
4. **SQL Injection Protection**: All SQLite queries use parameterized prepared statements (`db.prepare('... WHERE id = ?')`).


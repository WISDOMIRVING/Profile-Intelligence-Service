# Insighta Labs+ Profile Intelligence Service

[![CI/CD Pipeline](https://github.com/WISDOMIRVING/Profile-Intelligence-Service/actions/workflows/main.yml/badge.svg)](https://github.com/WISDOMIRVING/Profile-Intelligence-Service/actions/workflows/main.yml)

## 🚀 Overview
Insighta Labs+ is a secure, multi-interface platform designed for professional profile intelligence. It transforms raw data from multiple external sources into actionable, searchable, and manageable insights.

### 🔗 Related Interfaces
- **Web Portal**: [insighta-web](https://github.com/WISDOMIRVING/insighta-web)
- **CLI Tool**: [insighta-CLI](https://github.com/WISDOMIRVING/insighta-CLI)

---

## 🏗️ System Architecture
The platform follows a decoupled architecture:
1. **Core API (Node.js/Express)**: The central source of truth handling authentication, data enrichment, and role enforcement.
2. **Persistence (SQLite)**: High-performance local storage for profiles and user sessions.
3. **Identity (GitHub OAuth)**: Secure third-party authentication using PKCE for both web and terminal interfaces.

---

## 🔐 Authentication & Token Flow
We implement a secure **OAuth 2.0 + PKCE** flow:
- **Access Tokens**: Short-lived (3 minutes) JWTs containing `userId` and `role`.
- **Refresh Tokens**: 5-minute rotation tokens stored securely in the database.
- **PKCE Implementation**: CLI generates `code_verifier` and `code_challenge` to prevent interception attacks during terminal login.

### Security Features
- **HTTP-only Cookies**: Web sessions are secured via cookies that are inaccessible to JavaScript.
- **CSRF Protection**: State-modifying requests (POST/PUT/DELETE) require CSRF validation for web origin.
- **Rate Limiting**: 
    - Auth: 10 requests / minute
    - API: 60 requests / minute per user

---

## 👥 Role Enforcement (RBAC)
The system enforces two distinct roles:
- **Admin**: Full access to create profiles, search, and export the entire database to CSV.
- **Analyst**: Read-only access to list and search profiles.

*Note: The first user to register via GitHub is automatically promoted to Admin to bootstrap the system.*

---

## 📡 API Versioning
All profile endpoints are versioned. Requests **MUST** include the following header:
`X-API-Version: 1`

---

## 🛠️ CLI Usage
The CLI is globally installable:
```bash
cd insighta-CLI
npm link
insighta login
insighta profiles list
insighta profiles search "young males from nigeria"
```

---

## 📄 Natural Language Parsing
The search engine uses an advanced NLQ parser to translate human queries like *"young males from nigeria"* into structured SQL filters, mapping semantic terms to specific age ranges and country codes.

---

## 🚀 Deployment
- **Backend**: Hosted on Railway
- **Web**: Hosted on Vercel
- **Database**: SQLite (managed via Railway persistence volumes)

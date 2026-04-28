# Insighta Labs+ (Backend)

Insighta Labs+ is a secure, multi-interface platform for demographic intelligence. It upgrades the Profile Intelligence System into a production-ready application with full Authentication, Role-Based Access Control, and a unified backend for both a Web Portal and a CLI tool.

## System Architecture

The system consists of three separate repositories sharing a single source of truth:
1. **Backend (This Repository)**: A Node.js/Express service that handles database operations, external API enrichment, OAuth authentication, and rate-limiting. It exposes a unified API for all interfaces.
2. **CLI Application**: A global terminal tool for engineers. Communicates with the Backend using Bearer tokens and PKCE OAuth.
3. **Web Portal**: An intuitive UI for analysts. Communicates with the Backend using secure HTTP-only cookies and CSRF protection.

The database is an in-memory SQLite database (`sql.js`) that persists to disk (`profiles.db`). 

## Authentication Flow

We implemented a robust GitHub OAuth flow supporting both CLI and Web clients:
1. **Web Portal**: Users visit `/auth/github` which redirects to GitHub. After granting permission, GitHub redirects to `/auth/github/callback`. The backend retrieves the user profile, creates/updates the user record, and issues Access (3m) and Refresh (5m) tokens as **HTTP-only cookies**. The browser is then redirected to the web dashboard.
2. **CLI Tool**: The CLI initiates a PKCE flow and opens the browser. After the local server at http://localhost:3005 captures the GitHub callback, the CLI sends the `code` and `code_verifier` directly to the backend's `/auth/github/callback` endpoint. The backend exchanges these credentials and responds with JSON containing the tokens, which the CLI stores locally.

## Token Handling Approach

Tokens are handled using JSON Web Tokens (JWT) and a rotating refresh token strategy:
- **Access Tokens**: Short-lived (3 minutes) JWTs signed with a secure secret. They contain the `userId` and are used to quickly authenticate requests.
- **Refresh Tokens**: Opaque, securely generated 40-byte hex strings stored in the database, valid for 5 minutes.
- **Rotation**: Calling `POST /auth/refresh` immediately invalidates the old refresh token, deletes it from the database, and issues a completely new Access + Refresh token pair.
- **Delivery**: The backend seamlessly supports receiving tokens either via the `Authorization: Bearer <token>` header (for the CLI) or via `access_token` cookies (for the Web Portal).

## Role Enforcement Logic

Access control is enforced globally using a centralized middleware approach. The database includes a `role` field (`admin` or `analyst`):
- **All API routes** under `/api/*` require authentication. The `authenticate` middleware decodes the token, checks the database to ensure the user exists and is active (`is_active = 1`), and attaches `req.user`.
- **Admin Endpoints**: Modifying state (like `POST /api/profiles` and `DELETE /api/profiles/:id`) uses the `requireRole('admin')` middleware, which rejects the request with `403 Forbidden` if the user is not an admin.
- **Analyst Endpoints**: Read operations (like `GET /api/profiles`) default to allowing `analyst` and `admin` roles, provided the user is authenticated.

## Natural Language Parsing Approach

The `GET /api/profiles/search?q=...` endpoint uses a rule-based Natural Language Query (NLQ) parser that interprets plain English into structured database filters:
- **Age Mapping**: Detects keywords like "young" (16-24), "teenagers", "adult", "senior", or explicit constraints like "above 30" (translates to `min_age=30`).
- **Gender Mapping**: Detects "males" or "females".
- **Geospatial Mapping**: Matches country names (e.g., "nigeria", "kenya") and maps them to their respective ISO country IDs (`country_id = NG`).
The parsed filters are passed directly to the core pagination and filtering engine, returning structured results identically to the standard list endpoint.

## CLI Usage (Reference)

*(Note: The actual CLI is maintained in a separate repository, but relies on these backend endpoints)*
- `insighta login`: Initiates the PKCE OAuth flow.
- `insighta profiles list --country NG --age-group adult`: Uses advanced filtering.
- `insighta profiles search "young males from nigeria"`: Utilizes the NLQ parser.
- `insighta profiles export --format csv`: Downloads a CSV matching the query.

## API Additions (Stage 3)

- **API Versioning**: Every request to `/api/profiles*` MUST include the header `X-API-Version: 1`.
- **CSV Export**: `GET /api/profiles/export?format=csv` downloads a standardized CSV file.
- **Rate Limiting**: `/auth/*` limited to 10 requests/minute. `/api/*` limited to 60 requests/minute per user.
- **Structured Pagination**: Output now includes `total_pages` and `links` to `self`, `next`, and `prev`.

## Setup

```bash
npm install
npm run dev
```

The database will seed 2,026 profiles on the first run.
Ensure you have an `.env` file configured with `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `JWT_SECRET`.

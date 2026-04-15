# Profile Intelligence Service

A RESTful API service that enriches names with demographic intelligence by integrating multiple external APIs. Given a name, the service predicts gender, age, and nationality, then stores the structured result for future retrieval.

## Features

- **Multi-API Enrichment** — Aggregates data from Genderize, Agify, and Nationalize APIs
- **Data Persistence** — SQLite-backed storage with structured schema
- **Idempotency** — Duplicate name submissions return existing records without re-creation
- **Filtering** — Case-insensitive query filters on gender, country, and age group
- **UUID v7 IDs** — Time-ordered unique identifiers
- **Consistent Error Handling** — Structured JSON error responses with appropriate HTTP status codes

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | SQLite (via better-sqlite3) |
| HTTP Client | Axios |
| IDs | UUID v7 |

## Getting Started

### Prerequisites

- Node.js 18+

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/Profile-Intelligence-Service.git
cd Profile-Intelligence-Service
npm install
```

### Run Locally

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The server starts on `http://localhost:3000` by default. Set the `PORT` environment variable to change this.

## API Endpoints

### 1. Create Profile

```
POST /api/profiles
Content-Type: application/json

{ "name": "ella" }
```

**Response (201 Created):**
```json
{
  "status": "success",
  "data": {
    "id": "019...",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 1234,
    "age": 46,
    "age_group": "adult",
    "country_id": "DRC",
    "country_probability": 0.85,
    "created_at": "2026-04-01T12:00:00Z"
  }
}
```

If the name already exists, returns `200` with `"message": "Profile already exists"`.

### 2. Get Profile by ID

```
GET /api/profiles/:id
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": { "...profile..." }
}
```

### 3. List Profiles (with optional filters)

```
GET /api/profiles?gender=male&country_id=NG&age_group=adult
```

All filters are **case-insensitive** and optional.

**Response (200 OK):**
```json
{
  "status": "success",
  "count": 2,
  "data": [ "...profiles..." ]
}
```

### 4. Delete Profile

```
DELETE /api/profiles/:id
```

**Response:** `204 No Content`

## Error Responses

All errors follow this structure:

```json
{
  "status": "error",
  "message": "Description of what went wrong"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Missing or empty name |
| 404 | Profile not found |
| 422 | Invalid type (name must be a string) |
| 502 | External API returned invalid data |
| 500 | Internal server error |

## External APIs Used

| API | Purpose | URL |
|-----|---------|-----|
| Genderize | Gender prediction | https://api.genderize.io |
| Agify | Age prediction | https://api.agify.io |
| Nationalize | Nationality prediction | https://api.nationalize.io |

## Project Structure

```
├── index.js                 # App entry point
├── db.js                    # Database initialization & schema
├── routes/
│   └── profiles.js          # All profile endpoints
├── services/
│   └── enrichment.js        # External API integration
├── middleware/
│   └── validation.js        # Request validation
├── package.json
└── README.md
```

## License

MIT

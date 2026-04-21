# Queryable Intelligence Engine (Profile Service)

Upgrade your demographic intelligence system into a production-ready Queryable Intelligence Engine. This service collects, seeds, and exposes deep search capabilities for over 2,000 user profiles.

## Features

- **Advanced Filtering** — Combine gender, age, country, and probability scores in a single query.
- **Natural Language Query (NLQ)** — Search using plain English like *"young males from nigeria"*.
- **Data Seeding** — Automatically populates 2,026 records from an external source.
- **Sorting & Pagination** — Efficiently handle large datasets with custom page limits and sorting.
- **UUID v7 IDs** — Time-ordered unique identifiers for optimal database indexing.
- **CORS Enabled** — Ready for integration with any frontend application.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | SQLite (via sql.js) |
| IDs | UUID v7 |
| API Integration | Axios (for seeding & enrichment) |

## Getting Started

### Installation

```bash
git clone https://github.com/WISDOMIRVING/Profile-Intelligence-Service.git
cd Profile-Intelligence-Service
npm install
```

### Run Locally

```bash
npm run dev
```

The database will automatically seed with 2,026 profiles on first start.

## API Endpoints

### 1. Advanced Profile List
Returns a paginated list of profiles with optional filters and sorting.

```
GET /api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc
```

**Parameters:**
- `gender`: male | female
- `age_group`: child | teenager | adult | senior
- `country_id`: ISO code (e.g., NG)
- `min_age` / `max_age`: Numeric range
- `min_gender_probability` / `min_country_probability`: Confidence thresholds
- `sort_by`: age | created_at | gender_probability
- `order`: asc | desc
- `page` (default 1), `limit` (default 10, max 50)

### 2. Natural Language Search
Interpret plain English queries into structured filters.

```
GET /api/profiles/search?q=young males from nigeria
```

**Supported Patterns:**
- `"young"` (maps to ages 16–24)
- `"males"` / `"females"`
- `"above 30"` (min_age=30)
- `"teenagers"` / `"adult"` / `"senior"`
- `"from [country]"` (detects major country names)

### 3. Create Profile (Idempotent)
Enriches a name using demographic APIs.

```
POST /api/profiles
{ "name": "ella" }
```

### 4. Delete Profile
```
DELETE /api/profiles/:id
```

## Response Formats

### Success Response
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "data": [
    {
      "id": "019...",
      "name": "ella",
      "gender": "female",
      "gender_probability": 0.99,
      "age": 46,
      "age_group": "adult",
      "country_id": "CD",
      "country_name": "Congo",
      "country_probability": 0.85,
      "created_at": "2026-04-21T12:00:00Z"
    }
  ]
}
```

### Error Response
```json
{
  "status": "error",
  "message": "Invalid query parameters"
}
```

## Project Structure

```
├── index.js                 # App entry point
├── db.js                    # DB schema & automated seeding
├── routes/
│   └── profiles.js          # Advanced Filtering & NLQ Logic
├── services/
│   └── enrichment.js        # Demographic classification
├── middleware/
│   └── validation.js        # Input validation
```

## License
MIT

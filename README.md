# Smart Irrigation Intelligence Platform

Backend service for the Agriocom Engineering Challenge. Processes sensor data from agricultural fields, detects anomalies, generates alerts, and exposes a REST API for mobile clients.

![Tests](https://img.shields.io/badge/tests-81%20passing-brightgreen)
![Node](https://img.shields.io/badge/node-%3E%3D20-blue)
![Docker](https://img.shields.io/badge/docker-ready-blue)

---

## Submission deliverables

| Part | Deliverable | Location |
|---|---|---|
| Part 1 | Architecture diagram | [`docs/Architecture_Diagram.md`](docs/Architecture_Diagram.md) |
| Part 1 | Design document (LaTeX PDF) | [`docs/Part1_Design_Document.pdf`](docs/Part1_Design_Document.pdf) |
| Part 2 | Mathematical model (LaTeX PDF) | [`docs/Part2_Mathematical_Model.pdf`](docs/Part2_Mathematical_Model.pdf) |
| Part 3 | Source code | [`src/`](src/) |
| Part 3 | Unit + integration tests (81 tests) | [`tests/`](tests/) |
| Part 3 | Seed data | [`seed/seedData.js`](seed/seedData.js) |
| Part 4 | AI usage documentation | [`AI_USAGE.md`](AI_USAGE.md) |
| Part 5 | Engineering reflection | [`Reflection.md`](Reflection.md) |
| Bonus | Docker setup | [`Dockerfile`](Dockerfile) · [`docker-compose.yml`](docker-compose.yml) |

---

## Stack

- **Runtime:** Node.js 20
- **Framework:** Express.js
- **Database:** MongoDB (Mongoose)
- **Cache:** Redis (ioredis)
- **Containerisation:** Docker + Docker Compose
- **Tests:** Jest + Supertest

---

## Quick start (local)

### Prerequisites

- Node.js ≥ 20
- MongoDB running on `localhost:27017`
- Redis running on `localhost:6379` (optional — the service degrades gracefully without it)

```bash
git clone <repo-url>
cd smart-irrigation-platform

cp .env.example .env   # edit if needed

npm install
npm run seed           # populate MongoDB with demo data
npm run dev            # starts with nodemon on port 3000
```

The API will be available at `http://localhost:3000/api/v1`.

---

## Quick start (Docker)

Starts the app, MongoDB, and Redis in one command. No local installs needed beyond Docker.

```bash
# Production stack
docker compose up --build

# With Mongo Express UI at http://localhost:8081
docker compose --profile dev up --build

# Seed the database inside the running container
docker compose exec app node seed/seedData.js
```

---

## Running tests

```bash
# All tests (unit + integration)
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage report
npm run test:coverage
```

Tests use Jest with fully mocked dependencies — no running MongoDB or Redis required.

---

## API reference

All endpoints are prefixed with `/api/v1`.

### `POST /sensor-data`

Ingest one or more sensor readings.

**Request body** — array of reading objects:

```json
[
  {
    "sensor_id": "S1",
    "farm_id": "F1",
    "zone_id": "Z1",
    "timestamp": "2026-05-01T10:00:00Z",
    "soil_moisture": 22,
    "water_flow": 15,
    "temperature": 31
  }
]
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `sensor_id` | string | ✓ | Unique identifier for the sensor |
| `timestamp` | ISO 8601 string | ✓ | Reading timestamp |
| `soil_moisture` | number [0–100] | ✓ | Percentage |
| `water_flow` | number | ✓ | Litres per minute |
| `temperature` | number | ✓ | Degrees Celsius |
| `farm_id` | string | – | Optional association |
| `zone_id` | string | – | Optional association |

**Responses:**

| Status | Meaning |
|---|---|
| 201 | Reading(s) saved; response includes anomaly and alert counts |
| 400 | Validation failure; response includes field-level errors |
| 422 | All readings failed to process |

**Example response (201):**
```json
{
  "success": true,
  "message": "1 reading(s) saved successfully",
  "data": {
    "saved": 1,
    "anomalies_detected": 0,
    "alerts_created": 0,
    "errors": []
  }
}
```

---

### `GET /sensor-data/:sensorId/latest`

Returns the most recent reading for a specific sensor. Checks Redis first, falls back to MongoDB.

---

### `GET /sensor-data/:sensorId/averages`

Returns 5-minute and 15-minute rolling averages for moisture, temperature, and water flow.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "5min":  { "avg_soil_moisture": 24.5, "avg_temperature": 29.1, "avg_water_flow": 14.8, "reading_count": 5 },
    "15min": { "avg_soil_moisture": 23.2, "avg_temperature": 28.7, "avg_water_flow": 15.1, "reading_count": 15 }
  }
}
```

---

### `GET /alerts`

Retrieve alerts with optional filters.

**Query parameters:** `type`, `severity`, `sensor_id`, `farm_id`, `acknowledged`, `page`, `limit`

---

### `PATCH /alerts/:alertId/acknowledge`

Mark an alert as acknowledged.

---

### `GET /summary`

System-wide statistics. Cached for 60 seconds.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "sensor_count": 7,
    "alerts": { "total": 4, "anomaly": 3, "missing_reading": 1 },
    "last_hour": { "avg_soil_moisture": 32.4, "avg_temperature": 28.6, "reading_count": 427 },
    "computed_at": "2026-05-01T10:00:00Z",
    "from_cache": false
  }
}
```

---

### `GET /health`

Liveness check for load balancers and Docker health checks.

---

## Anomaly detection thresholds

| Field | Too low | Too high | Severity |
|---|---|---|---|
| `soil_moisture` | < 5% | > 95% | CRITICAL / HIGH |
| `temperature` | < -10°C | > 60°C | HIGH |
| `water_flow` | < 0 L/min | — | MEDIUM |

---

## Project structure

```
src/
  controllers/     Route handlers — thin, delegate to services
  services/        Business logic — sensor ingest, anomaly detection, alerting, caching
  routes/          Express routers
  models/          Mongoose schemas (SensorReading, Alert, Farm, Zone)
  middleware/      Error handler, request logger, rate limiter
  validators/      express-validator rule sets
  utils/           Logger, constants
  jobs/            Missed-reading cron job
tests/
  unit/            Pure logic tests — fully mocked, no HTTP, no DB
  integration/     Full request-response tests with mocked services
seed/              Development seed script (7 sensors, 441 readings, 4 alerts)
docs/              Architecture diagram, design document PDF, math model PDF
```

---

## Design decisions

**MongoDB over TimescaleDB** — schema also covers non-time-series entities (Farms, Zones). At very high write rates, TimescaleDB would be the migration target.

**Rolling averages via aggregation pipeline** — computed on read, cached in Redis. Avoids running-sum complexity for now; the Redis accumulator approach is the noted one-week improvement.

**Stateless processing service** — all state in MongoDB and Redis. Multiple instances run behind a load balancer with no coordination.

**Graceful Redis degradation** — every cache operation is wrapped in try/catch. Redis unavailable = non-fatal; falls through to MongoDB.

**Missed-reading cron** — checks Redis first (fast path), falls back to MongoDB. Duplicate alert suppression prevents spam on every tick.

---

## Assumptions

1. Sensor clocks are trusted. Drift detection not implemented in prototype.
2. No authentication on sensor ingestion in the prototype. Production uses per-farm API key.
3. Kafka and MQTT are designed in but not implemented — REST endpoint acts as the ingestion point.
4. AI prediction service is described architecturally; requires training data not available at prototype stage.

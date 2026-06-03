# Engineering Reflection

---

## 1. What was the hardest problem?

The missed-reading detection, and specifically getting the duplicate suppression right.

The naive approach is obvious: run a cron every 2 minutes, find sensors that haven't reported, raise an alert. But the moment you think about it running in a loop, you realise you'll spam the same alert every 2 minutes for a sensor that's been dark for an hour. So you add a check: "only create a new alert if there isn't already an open one in the last N minutes." That part was straightforward.

The harder problem was the query strategy. My first version queried `SensorReading` directly on every tick to find the latest timestamp per sensor — `find({sensor_id}).sort({timestamp: -1}).limit(1)` for each sensor. Fine for 10 sensors, but at 100,000 farms with multiple sensors each, that's tens of thousands of serial queries per cron tick. The cron would never finish before the next tick.

The fix was to use Redis as the fast path. Every time a reading is ingested, we write `sensor:latest:{sensorId}` to Redis with a TTL slightly longer than the missing-reading threshold. The cron reads from Redis first; if the key exists and is fresh, the sensor is alive. MongoDB only gets queried for sensors whose Redis key has expired — which is exactly the set of sensors we care about (the silent ones). At scale this collapses most of the cron's work to Redis lookups.

Getting the TTL arithmetic right (the Redis key TTL needs to be longer than the cron interval, or you get false positives right after a server restart) was the detail that took the most debugging.

---

## 2. What assumptions did I make?

**Sensor clocks are accurate.** The ingestion pipeline trusts the `timestamp` field on the reading. In practice, embedded hardware clocks drift and can be wrong by minutes or more. A production system should compare the sensor timestamp to the server's wall clock on ingest and flag or reject readings that are too far in the future or suspiciously far in the past.

**One reading per sensor per minute.** The missed-reading logic and rolling average windows assume this cadence. If some sensors report more frequently, the rolling averages become denser (fine). If sensors batch and send multiple readings at once after a gap, the missed-reading detection will fire incorrectly.

**farm_id and zone_id are strings, not ObjectId references.** This simplifies the schema and avoids populate() calls, at the cost of referential integrity. For a prototype with no user management system yet, this is the right tradeoff.

**Anomaly thresholds are global.** In reality, a moisture threshold of 5% is appropriate for some crops and wrong for others. The threshold configuration should eventually be per-zone, stored in the Zone document. The current global env-var approach is a placeholder.

**Redis being unavailable is non-critical.** The service falls through to MongoDB on cache misses. This is true for the read paths. It is not true for the missed-reading job's fast path — if Redis is down, the job falls back to MongoDB queries for every sensor, which at scale would be slow. This is documented but not solved in the prototype.

---

## 3. What would I improve with one more week?

**Pre-aggregated rolling averages.** Right now, every GET to `/sensor-data/:sensorId/averages` that misses cache runs a MongoDB aggregation. At high write throughput, the aggregation over the last 15 minutes on a large collection is slow. The fix is to maintain running sums in Redis: on every write, increment `avg:5min:{sensorId}:sum` and `avg:5min:{sensorId}:count` with appropriate expiry. The average is then `sum / count` in O(1). This is a standard streaming aggregation pattern that I didn't implement because it adds write-path complexity that isn't justified at prototype scale.

**Per-zone anomaly thresholds.** Move threshold configuration from global env vars to the Zone document in MongoDB. Add a middleware step that fetches the zone's threshold configuration before running anomaly detection. This makes the system actually useful for real farms with different crop types.

**Proper authentication.** API key per farm, hashed and stored in the Farm document. Middleware reads the `X-API-Key` header, looks up the farm, attaches `req.farm` to the request. Sensors send their farm's key; the API uses it to associate readings with the correct farm without requiring the sensor to know its own `farm_id`.

**Kafka integration.** Replace the synchronous `processSensorReadings()` call in the controller with a Kafka publish. The processing service becomes a Kafka consumer. This decouples ingest throughput from processing throughput and makes the pipeline horizontally scalable in the way the design document describes.

**Better test coverage for the cron job.** The current missed-reading tests work but they don't test the Redis fast path — because Redis is disabled in the test environment. I'd add tests with a real Redis instance (or a mock) to cover the case where the cron correctly skips a sensor whose Redis key is fresh.

---

## 4. What would break first at 10× scale?

**MongoDB write throughput, specifically on the SensorReading collection.**

The current setup is a single MongoDB primary. At 10× scale — 1 million farms, sensors reporting every minute — that's in the range of 1–10 million writes per minute depending on sensor density. A single well-spec'd MongoDB node handles maybe 50,000–100,000 writes per second comfortably. We'd hit that ceiling.

The short-term fix is sharding `SensorReading` by `farm_id`. This distributes writes across multiple nodes. The compound index `(sensor_id, timestamp)` works fine on a sharded cluster as long as queries always include `sensor_id` (they do).

The medium-term fix is moving `SensorReading` to TimescaleDB or InfluxDB, both of which are purpose-built for time-series ingest at this scale and compress data much more efficiently than MongoDB.

The second thing to break would be the rolling average aggregations. At 10× write volume, the aggregation pipeline runs over a much larger dataset. Redis caching helps, but cache misses are expensive. The pre-aggregated running-sum approach described above becomes necessary, not optional.

The missed-reading cron would also start struggling — 10× more sensors means 10× more Redis lookups per tick. The cron interval would need to be spread out (run checks for a subset of sensors per tick, cycle through all sensors over N ticks) rather than checking every sensor on every run.

---

## 5. What would you monitor in production?

**Business-level metrics** (the ones that matter to the customer):
- `sensors_missing_count` by farm — sudden spikes mean connectivity failure or hardware issues in the field
- `anomalies_per_minute` by zone — a spike in moisture anomalies across a zone might mean an irrigation system failure, not individual sensor errors
- `alert_acknowledgement_lag` — how long it takes from alert creation to acknowledgement; a leading indicator of whether farmers are actually seeing and responding to the system

**Infrastructure metrics:**
- MongoDB: operation latency (p99 on writes and reads), connection pool utilisation, replication lag on secondaries
- Redis: hit/miss ratio per key prefix, eviction rate (a high eviction rate on sensor keys means the TTL is too short or memory is undersized), command latency
- Node.js: event loop lag (the single most important metric for a Node.js service under load — if it climbs above ~50ms, the service is under pressure), heap used, GC pause duration
- Kafka (when introduced): consumer group lag — growing lag means the processing service can't keep up with ingest rate and is the earliest warning of a capacity problem

**Alerting thresholds I'd set on day one:**
- Event loop lag > 100ms for > 2 minutes → page
- MongoDB write latency p99 > 500ms → page
- `sensors_missing_count` > 5% of total registered sensors → page
- API error rate > 1% over a 5-minute window → page
- Redis eviction rate > 0 (any eviction is a problem given the key importance) → alert

The monitoring I'd defer until after launch: detailed per-endpoint latency breakdowns, database query plan analysis, and cost attribution per farm. These are useful but not day-one critical.

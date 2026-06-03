# AI Usage Documentation

This document records how I used AI tools during this challenge, what was useful, what wasn't, and what I had to fix manually. Written honestly — I used Claude fairly heavily and want to be accurate about where it helped and where it didn't.

---

## Tool used

**Claude (claude.ai)** — primarily for code generation, rubber-ducking architecture decisions, and drafting the mathematical model explanation.

I also tried Copilot inside VS Code for inline completions while writing the service files, but it kept suggesting Express patterns I wasn't using (it wanted to scaffold routes with `app.get` directly instead of `Router()`), so I turned it off fairly quickly.

---

## How I used Claude

### 1. Architecture review

**Prompt (paraphrased):**
> I'm building a sensor ingestion platform that needs to handle 100k farms at scale. I'm thinking MQTT → Kafka → Node.js processing service → MongoDB + Redis → REST API. Does this make sense or am I overcomplicating it for a prototype?

**What was useful:**
Claude pushed back on Kafka being appropriate for a prototype and pointed out the operational cost. It suggested being explicit about this as a "designed-in future seam" rather than implementing it. That framing ended up in the design document and I think it reads honestly.

It also suggested EMQX over Mosquitto for clustered MQTT, which I hadn't considered — Mosquitto is the obvious first choice but it doesn't scale horizontally. Good catch.

**What I changed:**
The wording Claude suggested for the design doc was too formal and read like marketing copy. I rewrote most of the technology justification sections in my own voice.

---

### 2. MongoDB schema design

**Prompt:**
> Here are my four collections: SensorReading, Alert, Farm, Zone. What indexes should I create given these query patterns: rolling averages by sensor + time window, alerts by farm sorted by created_at desc, TTL expiry on old readings?

**What was useful:**
The compound index suggestion for `(sensor_id, timestamp)` was exactly right — I hadn't thought carefully about the sort order and Claude flagged that `timestamp: -1` (descending) is better for "most recent first" queries, which is the dominant pattern.

The TTL index suggestion was something I knew about but would have forgotten to include. Useful reminder.

**What was incorrect:**
Claude initially suggested a sparse index on `farm_id` because it's nullable. That's technically valid but unnecessary overhead for this query pattern — I don't query by farm_id alone on SensorReading, only on Alert. Removed it.

---

### 3. Rolling average implementation

**Prompt:**
> Write a MongoDB aggregation pipeline that computes a rolling average of soil_moisture, temperature, and water_flow for a given sensor_id over the past N minutes.

**What was useful:**
The `$match` + `$group` pipeline structure was correct and saved me time. Claude also correctly identified that the aggregation should use `$gte` on timestamp rather than a `$range` stage.

**What was incorrect:**
Claude's first version didn't round the output values. When I tested it, `avg_soil_moisture` was coming back as `32.66666666666667`. I added the `round()` utility function myself.

It also initially returned the average as part of a nested object (`result[0].result.avg_moisture`) which was wrong — MongoDB's `$group` with `$avg` puts the value directly on the group document. Minor, but I had to debug it.

---

### 4. Missed-reading job logic

**Prompt:**
> I need a cron job that runs every 2 minutes and checks which sensors haven't sent data recently. Sensors can go dark for legitimate reasons (connectivity). How do I avoid spamming alerts?

**What was useful:**
The duplicate suppression strategy — checking for an existing unresolved alert within a time window before creating a new one — came from Claude. I'd been thinking about this problem and was going to use a Redis set to track "alerted sensors", but the MongoDB lookup approach is simpler and doesn't add a Redis dependency to the job.

The `isRunning` guard (skip the job if the previous tick is still executing) was also Claude's suggestion. Good defensive programming that I wouldn't have thought to add.

**What was incorrect / changed:**
Claude's initial version of the job called `SensorReading.find()` and then iterated to find the latest timestamp per sensor — O(n) queries for n sensors. I rewrote it to use `SensorReading.distinct('sensor_id')` to get sensor IDs first, then check Redis (fast path) before falling back to a single MongoDB query per sensor. Much better.

---

### 5. Test structure

**Prompt:**
> Give me a Jest test file for the anomaly detection service. It should be pure unit tests — no database, no mocking, just the function.

**What was useful:**
Claude correctly identified that `anomalyService.js` is pure functions (no I/O) and suggested testing without any mocking at all. The boundary condition tests (exactly at threshold = not anomalous) came from this session and are the most valuable tests in the suite.

**What was incorrect:**
Claude generated a test for `water_flow === 0` that expected an anomaly. The spec says `water_flow < 0` — zero is valid. I had to correct this, which actually made me re-read the requirements carefully and confirm my implementation was right.

---

### 6. Mathematical model (Part 2)

**Prompt:**
> I need to write a mathematical irrigation allocation model. Given: 10 zones, each with area, moisture %, and daily water need in litres. Total water available: 100,000L. 60% probability of rain tomorrow. Design an algorithm that allocates water sensibly.

**What was useful:**
Claude suggested the concept of a "drought stress score" combining moisture deficit and zone priority, which gave the model a principled basis. The rainfall adjustment factor (`1 - P(rain)`) as a multiplier on water need was also from this conversation — simple and sensible.

**What I changed:**
Claude's pseudocode was clear but the mathematical notation was inconsistent (mixing different variable naming conventions). I rewrote the formulas and the worked example from scratch using the LaTeX template, keeping Claude's underlying approach but making the notation consistent.

---

## General observations

Claude is good at:
- Spotting things I'd forget (TTL indexes, signal handling in Docker, the `isRunning` guard)
- Rubber-ducking architecture decisions — it will push back if something seems wrong
- Generating boilerplate that's correct 80% of the time (the other 20% needs careful review)

Claude is not good at:
- Getting aggregation pipeline output shapes right on the first try
- Writing in a natural engineering voice — the first drafts of documentation are always too formal
- Understanding the full context of a system across multiple files — it loses track of decisions made earlier in the conversation

The workflow that worked: generate a draft with Claude, read it carefully, test it, fix what's wrong, rewrite the prose. Using it as a starting point rather than a final answer.

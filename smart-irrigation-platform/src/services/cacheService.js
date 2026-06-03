const Redis = require('ioredis');
const logger = require('../utils/logger');

let client = null;
let connected = false;

function getClient() {
  if (client) return client;

  if (process.env.NODE_ENV === 'test' && !process.env.REDIS_TEST_ENABLED) {
    return null;
  }

  client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 200, 1000);
    },
    enableOfflineQueue: false,
  });

  client.on('connect', () => {
    connected = true;
    logger.info('Redis connected');
  });

  client.on('error', (err) => {
    connected = false;
    logger.warn('Redis error — cache disabled', { message: err.message });
  });

  client.on('close', () => {
    connected = false;
  });

  client.connect().catch(() => {
  });

  return client;
}

async function get(key) {
  const c = getClient();
  if (!c || !connected) return null;
  try {
    const val = await c.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    logger.warn('Cache GET failed', { key, message: err.message });
    return null;
  }
}

async function set(key, value, ttlSeconds) {
  const c = getClient();
  if (!c || !connected) return false;
  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds) {
      await c.set(key, payload, 'EX', ttlSeconds);
    } else {
      await c.set(key, payload);
    }
    return true;
  } catch (err) {
    logger.warn('Cache SET failed', { key, message: err.message });
    return false;
  }
}

async function del(key) {
  const c = getClient();
  if (!c || !connected) return false;
  try {
    await c.del(key);
    return true;
  } catch (err) {
    logger.warn('Cache DEL failed', { key, message: err.message });
    return false;
  }
}

async function delPattern(pattern) {
  const c = getClient();
  if (!c || !connected) return false;
  try {
    const keys = await c.keys(pattern);
    if (keys.length) await c.del(...keys);
    return true;
  } catch (err) {
    logger.warn('Cache DEL pattern failed', { pattern, message: err.message });
    return false;
  }
}

function isConnected() {
  return connected;
}

async function disconnect() {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
    connected = false;
  }
}

module.exports = { get, set, del, delPattern, isConnected, disconnect, getClient };
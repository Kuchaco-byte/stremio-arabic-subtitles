const cache = new Map();

/**
 * Get item from cache
 * @param {string} key 
 * @returns {any|null}
 */
function get(key) {
    const entry = cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

/**
 * Set item in cache
 * @param {string} key 
 * @param {any} value 
 * @param {number} ttlSeconds Default 24 hours
 */
function set(key, value, ttlSeconds = 86400) {
    cache.set(key, {
        value,
        expiry: Date.now() + (ttlSeconds * 1000)
    });
}

/**
 * Clear expired items (cleanup)
 */
function cleanup() {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
        if (now > entry.expiry) {
            cache.delete(key);
        }
    }
}

// Run cleanup every hour
setInterval(cleanup, 3600000);

module.exports = { get, set };

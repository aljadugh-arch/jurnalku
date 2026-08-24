function createVersionResolver(fetchLatest, { ttlMs = 60 * 60 * 1000 } = {}) {
  let cachedVersion = null
  let expiresAt = 0
  return async function resolveVersion() {
    if (cachedVersion && Date.now() < expiresAt) return cachedVersion
    try {
      const result = await fetchLatest()
      if (!Array.isArray(result?.version)) throw Error('Versi Baileys tidak valid')
      cachedVersion = result.version
      expiresAt = Date.now() + ttlMs
      return cachedVersion
    } catch (error) {
      if (cachedVersion) return cachedVersion
      throw error
    }
  }
}

async function forEachTenantSettled(rows, action, onError = () => {}) {
  for (const row of rows) {
    try { await action(row) } catch (error) { onError(error, row) }
  }
}

module.exports = { createVersionResolver, forEachTenantSettled }
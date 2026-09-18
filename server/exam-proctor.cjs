const parseArray = value => {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function monitorStatus({ sessionStatus, lastSeenAt, now = new Date() }) {
  if (!sessionStatus || sessionStatus === 'belum') return 'belum'
  if (sessionStatus === 'selesai') return 'selesai'

  const nowMs = new Date(now).getTime()
  const seenMs = new Date(lastSeenAt).getTime()
  if (!Number.isFinite(nowMs) || !Number.isFinite(seenMs)) return 'offline'

  const ageMs = Math.max(0, nowMs - seenMs)
  if (ageMs <= 30_000) return 'online'
  if (ageMs <= 120_000) return 'stale'
  return 'offline'
}

function sanitizeExamForMonitor(exam = {}) {
  const safe = {}
  const allowed = [
    'id', 'nama', 'mapel_id', 'mapel_nama', 'jenis', 'model', 'tingkat',
    'tahun_ajaran', 'semester', 'durasi_menit', 'status', 'mulai', 'selesai'
  ]
  for (const key of allowed) {
    if (Object.hasOwn(exam, key)) safe[key] = exam[key]
  }
  safe.rombel_ids = parseArray(exam.rombel_ids)
  safe.jumlah_soal = parseArray(exam.soal_ids).length
  return safe
}

module.exports = { monitorStatus, sanitizeExamForMonitor }

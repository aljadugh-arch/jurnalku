/**
 * WhatsApp Gateway Service - Hybrid (Baileys + Sidobe)
 * Per-tenant config. Stateless: config diambil per-call berdasarkan tenantId.
 */

class WAGateway {
  constructor(db) {
    this.db = db
  }

  // Ambil config WA untuk 1 tenant. Auto-create baris default kalau belum ada.
  getConfig(tenantId = 'default') {
    let row = this.db.prepare('SELECT * FROM wa_gateway_config WHERE tenant_id = ?').get(tenantId)
    if (!row) {
      // Lazy-create baris config untuk tenant ini
      this.db.prepare("INSERT INTO wa_gateway_config (id, tenant_id) VALUES (?, ?)").run('wa_' + tenantId, tenantId)
      row = this.db.prepare('SELECT * FROM wa_gateway_config WHERE tenant_id = ?').get(tenantId)
    }
    return {
      baileys_session: row.baileys_session || '',
      baileys_webhook: row.baileys_webhook || '',
      sidobe_api_url: row.sidobe_api_url || '',
      sidobe_api_key: row.sidobe_api_key || '',
      sidobe_device_id: row.sidobe_device_id || '',
      provider: row.provider || 'baileys',
      enabled: row.enabled === 1,
      sender_name: row.sender_name || 'JURNALKU'
    }
  }

  async sendMessage(phone, message, tenantId = 'default') {
    const config = this.getConfig(tenantId)
    if (!config.enabled) {
      return { success: false, error: 'WA Gateway tidak aktif' }
    }
    phone = this.normalizePhone(phone)
    if (config.provider === 'baileys') {
      return await this.sendViaBaileys(phone, message, config)
    } else if (config.provider === 'sidobe') {
      return await this.sendViaSidobe(phone, message, config)
    }
    return { success: false, error: 'Provider tidak dikonfigurasi' }
  }

  async sendBulk(recipients, message, tenantId = 'default', options = {}) {
    const config = this.getConfig(tenantId)
    const results = []
    const delay = options.delay || 2000
    for (const recipient of recipients) {
      try {
        const result = await this.sendMessage(recipient.phone, this.renderTemplate(message, recipient, config), tenantId)
        results.push({ phone: recipient.phone, nama: recipient.nama, ...result })
      } catch (err) {
        results.push({ phone: recipient.phone, nama: recipient.nama, success: false, error: err.message })
      }
      if (delay > 0) await new Promise(r => setTimeout(r, delay))
    }
    return results
  }

  async sendViaBaileys(phone, message, config) {
    const url = config.baileys_webhook || 'http://localhost:8000/send-message'
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message })
      })
      const data = await resp.json()
      return { success: data.status === true || data.success === true, messageId: data.messageId || data.id }
    } catch (err) {
      return { success: false, error: `Baileys error: ${err.message}` }
    }
  }

  async sendViaSidobe(phone, message, config) {
    const url = `${config.sidobe_api_url || 'https://api.sidobe.com'}/v1/messages/send`
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.sidobe_api_key}`,
        },
        body: JSON.stringify({
          device_id: config.sidobe_device_id,
          phone,
          message,
          type: 'text'
        })
      })
      const data = await resp.json()
      return { success: data.status === 'sent' || data.success === true, messageId: data.message_id || data.id }
    } catch (err) {
      return { success: false, error: `Sidobe error: ${err.message}` }
    }
  }

  normalizePhone(phone) {
    if (!phone) return ''
    phone = phone.toString().replace(/[^0-9]/g, '')
    if (phone.startsWith('08')) phone = '628' + phone.slice(2)
    if (phone.startsWith('8')) phone = '62' + phone
    if (!phone.startsWith('62')) phone = '62' + phone
    return phone
  }

  renderTemplate(template, data, config = {}) {
    return template
      .replace(/\{nama\}/g, data.nama || '')
      .replace(/\{nis\}/g, data.nis || '')
      .replace(/\{nip\}/g, data.nip || '')
      .replace(/\{kelas\}/g, data.kelas || '')
      .replace(/\{mapel\}/g, data.mapel || '')
      .replace(/\{tanggal\}/g, data.tanggal || '')
      .replace(/\{jam\}/g, data.jam || '')
      .replace(/\{jumlah\}/g, data.jumlah || '')
      .replace(/\{status\}/g, data.status || '')
      .replace(/\{lembaga\}/g, config.sender_name || 'Sekolah')
  }
}

module.exports = WAGateway

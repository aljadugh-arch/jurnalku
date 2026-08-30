const sharp = require('sharp')

const MAX_IMAGE_DIMENSION = 1920
const WEBP_QUALITY = 78

async function compressImageBuffer(input, options = {}) {
  if (!Buffer.isBuffer(input) || !input.length) throw new Error('Gambar kosong')
  const maxDimension = Number(options.maxDimension || MAX_IMAGE_DIMENSION)
  const quality = Number(options.quality || WEBP_QUALITY)
  return sharp(input, { animated: false, failOn: 'error' })
    .rotate()
    .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality, alphaQuality: 85, effort: 5, smartSubsample: true })
    .toBuffer()
}

module.exports = { compressImageBuffer, MAX_IMAGE_DIMENSION, WEBP_QUALITY }

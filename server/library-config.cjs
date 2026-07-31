const DRIVE_FOLDER = /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/[A-Za-z0-9_-]+\/?(?:\?[^#\s]*)?$/

function isDriveFolderUrl(value) {
  return typeof value === 'string' && value.length <= 500 && DRIVE_FOLDER.test(value)
}

module.exports = { isDriveFolderUrl }

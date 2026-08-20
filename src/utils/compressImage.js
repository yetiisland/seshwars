const FALLBACK_MAX_BYTES = 4 * 1024 * 1024

export async function compressImage(file, maxDim = 1200, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    const fallbackToOriginal = (reason) => {
      console.warn(`compressImage: falling back to original file (${reason}), size=${file.size} bytes`)
      if (file.size > FALLBACK_MAX_BYTES) {
        reject(new Error(`This photo couldn't be compressed and is too large to upload (${(file.size / 1024 / 1024).toFixed(1)}MB). Please try a different photo.`))
        return
      }
      resolve(file)
    }

    img.onload = () => {
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round(height * maxDim / width)
          width = maxDim
        } else {
          width = Math.round(width * maxDim / height)
          height = maxDim
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else fallbackToOriginal('canvas.toBlob returned null')
      }, 'image/jpeg', quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      fallbackToOriginal('image failed to decode')
    }
    img.src = url
  })
}

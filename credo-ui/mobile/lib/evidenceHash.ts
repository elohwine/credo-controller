/**
 * Content hash for a photo taken on the phone. The server stores the hash next to the photo so
 * a record (before/after photos, a safety-hold photo) can be checked against the image later.
 * Used by the evidence camera and the safety check.
 */
export async function sha256Hex(dataUrl: string): Promise<string> {
  const base64 = dataUrl.split(',')[1] ?? dataUrl
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Take one live photo with the device camera (no gallery) and return it as a data URL.
 * Same camera call for job photos and the safety-hold photo.
 */
export async function captureLivePhotoDataUrl(): Promise<string> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  const photo = await Camera.getPhoto({
    // 1600 px on the long side, kept sharp enough that the time and place stamped on it stay readable.
    quality: 85,
    width: 1600,
    height: 1600,
    correctOrientation: true,
    saveToGallery: false,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
  })
  if (!photo.dataUrl) throw new Error('No image returned')
  return stampPhotoDataUrl(photo.dataUrl)
}

/** Writes the time, and the location when the phone shares it, onto the photo itself. */
export async function stampPhotoDataUrl(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined') return dataUrl
  const place = await new Promise<string>((resolve) => {
    if (!navigator.geolocation) {
      resolve('')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(`${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`),
      () => resolve(''),
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 60_000 },
    )
  })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('The photo could not be prepared'))
    element.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const pen = canvas.getContext('2d')
  if (!pen) return dataUrl
  pen.drawImage(image, 0, 0)
  const fontSize = Math.max(18, Math.round(image.width / 36))
  const bar = Math.round(fontSize * 3.4)
  pen.fillStyle = 'rgba(0,0,0,0.55)'
  pen.fillRect(0, image.height - bar, image.width, bar)
  pen.fillStyle = '#ffffff'
  pen.font = `${fontSize}px sans-serif`
  pen.fillText(new Date().toLocaleString(), fontSize, image.height - bar + fontSize * 1.35)
  pen.fillText(place || 'Location not shared', fontSize, image.height - bar + fontSize * 2.55)
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** A live photo plus its hash, ready to send with a job record. */
export async function captureHashedPhoto(): Promise<{ photoUri: string; evidenceHash: string; capturedAt: string }> {
  const photoUri = await captureLivePhotoDataUrl()
  return { photoUri, evidenceHash: await sha256Hex(photoUri), capturedAt: new Date().toISOString() }
}

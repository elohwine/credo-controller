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
    // About 1600 px on the long side keeps a job photo near 300 KB: clear enough to see the
    // work, small enough to send on mobile data and to keep as a draft on the phone.
    quality: 70,
    width: 1600,
    height: 1600,
    correctOrientation: true,
    saveToGallery: false,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
  })
  if (!photo.dataUrl) throw new Error('No image returned')
  return photo.dataUrl
}

/** A live photo plus its hash, ready to send with a job record. */
export async function captureHashedPhoto(): Promise<{ photoUri: string; evidenceHash: string; capturedAt: string }> {
  const photoUri = await captureLivePhotoDataUrl()
  return { photoUri, evidenceHash: await sha256Hex(photoUri), capturedAt: new Date().toISOString() }
}

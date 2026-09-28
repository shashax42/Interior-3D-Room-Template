/** Reads an image file, shrinking it so project storage stays small. */
export async function readImage(file: File, maxSide = 2048): Promise<{ dataUrl: string; width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.round(img.naturalWidth * k)
    const height = Math.round(img.naturalHeight * k)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

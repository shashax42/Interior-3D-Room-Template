import { useState } from 'react'
import { create } from 'zustand'

/**
 * Saving images. Opened from the hosted link, the app runs in a frame where script-started downloads are blocked,
 * so there the image is shown full size instead, to save or copy with the browser's own long-press or right-click
 * menu. Opened locally, it downloads as usual.
 */

type SheetState = { image: string | null; name: string; open: (image: string, name: string) => void; close: () => void }

const useSaveSheet = create<SheetState>((set) => ({
  image: null,
  name: '',
  open: (image, name) => set({ image, name }),
  close: () => set({ image: null }),
}))

const embedded = () => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

export function saveImage(dataUrl: string, filename: string) {
  if (embedded()) {
    useSaveSheet.getState().open(dataUrl, filename)
    return
  }
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

/**
 * Puts an image on the clipboard as PNG (the one image type browsers accept there). The clipboard write starts
 * right away with a promised blob, so it still counts as part of the click even though converting takes a moment.
 */
export function copyImage(dataUrl: string) {
  const png = (async () => {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d')!.drawImage(img, 0, 0)
    return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/png'))
  })()
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}

export function SaveSheet() {
  const { image, name, close } = useSaveSheet()
  const [copy, setCopy] = useState<'idle' | 'ok' | 'fail'>('idle')
  if (!image) return null
  return (
    <div className="save-sheet" role="dialog" aria-label="이미지 저장">
      <img src={image} alt={name} />
      <div className="save-bar">
        <p>
          폰은 이미지를 <b>길게 눌러서</b>, PC는 <b>오른쪽 클릭</b>해서 저장하거나 복사하세요.
        </p>
        <button
          className="btn primary"
          onClick={() =>
            copyImage(image)
              .then(() => setCopy('ok'))
              .catch(() => setCopy('fail'))
          }
        >
          {copy === 'ok' ? '복사됨 ✓ 붙여넣기 하세요' : copy === 'fail' ? '복사가 막혀 있어요. 길게 눌러 저장해주세요' : '이미지 복사'}
        </button>
        <button
          className="btn"
          onClick={() => {
            setCopy('idle')
            close()
          }}
        >
          닫기
        </button>
      </div>
    </div>
  )
}

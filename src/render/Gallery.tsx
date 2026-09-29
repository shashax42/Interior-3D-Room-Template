import { useState } from 'react'
import { useStore } from '../store'
import type { GalleryPhoto } from '../types'
import { Compare } from './AiPhotoOverlay'
import { saveImage } from '../ui/SaveSheet'
import { Section } from '../ui/fields'

function Viewer({ item, onClose }: { item: GalleryPhoto; onClose: () => void }) {
  const remove = useStore((s) => s.removeFromGallery)
  const name = useStore((s) => s.project.room.name) || 'room'
  const [armed, setArmed] = useState(false)
  return (
    <div className="ai-overlay" role="dialog" aria-label="실사 사진">
      <div className="ai-stage">
        <Compare before={item.layout} after={item.photo} />
      </div>
      <div className="ai-panel">
        <p className="hint">사진 위를 좌우로 밀면 3D와 비교할 수 있어요.</p>
        <button className="btn primary" onClick={() => saveImage(item.photo, `${name}-photo.jpg`)}>사진 저장</button>
        <button
          className="btn danger"
          onClick={() => {
            if (!armed) return setArmed(true)
            remove(item.id)
            onClose()
          }}
        >
          {armed ? '한 번 더 누르면 지워져요' : '갤러리에서 지우기'}
        </button>
        <button className="btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

/** Photos made from the 3D view, newest first. */
export function GallerySection() {
  const gallery = useStore((s) => s.project.gallery ?? [])
  const [open, setOpen] = useState<GalleryPhoto | null>(null)
  if (!gallery.length) return null
  return (
    <Section title={`내 실사 사진 (${gallery.length})`}>
      <div className="gallery">
        {gallery.map((g) => (
          <button key={g.id} onClick={() => setOpen(g)} aria-label="사진 크게 보기">
            <img src={g.photo} alt="" />
          </button>
        ))}
      </div>
      {open && <Viewer item={open} onClose={() => setOpen(null)} />}
    </Section>
  )
}

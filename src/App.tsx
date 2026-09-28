import { useEffect, useRef, useState } from 'react'
import { useStore, type Step } from './store'
import type { RoomPhoto } from './types'
import { RoomStep } from './steps/RoomStep'
import { PhotoStep } from './steps/PhotoStep'
import { DecorateStep } from './steps/DecorateStep'
import { TourStep } from './steps/TourStep'
import { mountOf } from './furniture/catalog'

const STEPS: { id: Step; label: string }[] = [
  { id: 'room', label: '방 만들기' },
  { id: 'photo', label: '사진 입히기' },
  { id: 'decorate', label: '꾸미기' },
  { id: 'tour', label: '룸투어' },
]

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      const s = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (s.step === 'tour') return
      const sel = s.selection
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        if (sel.type === 'furniture') {
          s.checkpoint()
          s.removeFurniture(sel.id)
          s.select(null)
        } else if (sel.type === 'opening') {
          s.checkpoint()
          s.removeOpening(sel.id)
          s.select(null)
        }
      }
      if ((e.key === 'q' || e.key === 'e') && sel?.type === 'furniture') {
        const item = s.project.furniture.find((f) => f.id === sel.id)
        if (!item || mountOf(item) !== 'floor') return
        s.checkpoint()
        s.updateFurniture(item.id, { rotation: item.rotation + (e.key === 'q' ? 1 : -1) * (Math.PI / 12) })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  const step = useStore((s) => s.step)
  const setStep = useStore((s) => s.setStep)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const [photoView, setPhotoView] = useState<RoomPhoto | null>(null)
  const [lookId, setLookId] = useState('film')
  const capture = useRef<(() => HTMLCanvasElement) | null>(null)
  useShortcuts()

  return (
    <div className={`app step-${step}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>◐</span>
          우리집 미리보기
        </div>
        <nav className="steps">
          {STEPS.map((s, i) => (
            <button key={s.id} className={step === s.id ? 'on' : ''} onClick={() => setStep(s.id)}>
              <span className="n">{i + 1}</span>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="history">
          <button onClick={undo} disabled={!canUndo} title="되돌리기 (⌘Z)">↶</button>
          <button onClick={redo} disabled={!canRedo} title="다시 하기 (⇧⌘Z)">↷</button>
        </div>
      </header>
      <div className="body">
        {step === 'room' && <RoomStep />}
        {step === 'photo' && (
          <PhotoStep
            onPreview={(p) => {
              setPhotoView(p)
              setStep('decorate')
            }}
          />
        )}
        {step === 'decorate' && (
          <DecorateStep photoView={photoView} setPhotoView={setPhotoView} capture={capture} lookId={lookId} setLookId={setLookId} />
        )}
        {step === 'tour' && <TourStep capture={capture} lookId={lookId} setLookId={setLookId} />}
      </div>
    </div>
  )
}

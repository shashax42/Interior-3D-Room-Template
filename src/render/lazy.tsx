import { lazy, Suspense, type ComponentProps } from 'react'

// The photoreal renderer (path tracer + AI denoiser) and the VR tour viewer are large and only used on demand,
// so they download when first opened instead of with the app.

const PhotorealOverlayImpl = lazy(() => import('./PhotorealOverlay').then((m) => ({ default: m.PhotorealOverlay })))
const PanoTourImpl = lazy(() => import('./PanoTour').then((m) => ({ default: m.PanoTour })))

const Loading = ({ text }: { text: string }) => (
  <div className="trace-overlay">
    <p className="trace-hint">{text}</p>
  </div>
)

export function PhotorealOverlay(props: ComponentProps<typeof PhotorealOverlayImpl>) {
  return (
    <Suspense fallback={<Loading text="실사 렌더 준비 중…" />}>
      <PhotorealOverlayImpl {...props} />
    </Suspense>
  )
}

export function PanoTour(props: ComponentProps<typeof PanoTourImpl>) {
  return (
    <Suspense fallback={<Loading text="VR 투어 불러오는 중…" />}>
      <PanoTourImpl {...props} />
    </Suspense>
  )
}

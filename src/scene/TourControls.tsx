import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { FurnitureItem, Room, Vec2 } from '../types'
import { centroid, pointInPolygon, projectOnWall, wallSegments } from '../geometry/plan'
import { insideFootprint } from '../furniture/placement'
import { isWalkable } from '../furniture/catalog'

export const EYE_HEIGHT = 1.6
const SPEED = 1.6 // m/s
const BODY = 0.25 // how close to a wall or furniture you can stand

/** Movement input from the on-screen joystick, shared with the TourJoystick overlay. x: strafe, y: forward. */
export const joystick = { x: 0, y: 0 }

/** First-person walking: drag to look around, WASD / arrow keys or the joystick to move. */
export function TourControls({ room, furniture, start }: { room: Room; furniture: FurnitureItem[]; start?: Vec2 }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const dom = useThree((s) => s.gl.domElement)
  const look = useRef({ yaw: 0, pitch: 0 })
  const keys = useRef(new Set<string>())

  useEffect(() => {
    const p = start ?? centroid(room.corners)
    camera.position.set(p.x, EYE_HEIGHT, p.z)
    // Face the room's middle from wherever we start.
    const c = centroid(room.corners)
    const yaw = start ? Math.atan2(c.x - p.x, -(c.z - p.z)) : 0
    look.current = { yaw, pitch: 0 }
    camera.fov = 70
    camera.updateProjectionMatrix()
    // Only on entering the tour; later room edits should not teleport you.
  }, [])

  useEffect(() => {
    let dragging: { id: number; x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY }
      dom.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging || dragging.id !== e.pointerId) return
      const dx = e.clientX - dragging.x
      const dy = e.clientY - dragging.y
      dragging.x = e.clientX
      dragging.y = e.clientY
      // Drag the view like a photo sphere: pulling right turns you left.
      const k = e.pointerType === 'touch' ? 0.006 : 0.0035
      look.current.yaw -= dx * k
      look.current.pitch = Math.max(-1.3, Math.min(1.3, look.current.pitch - dy * k))
    }
    const up = (e: PointerEvent) => {
      if (dragging?.id === e.pointerId) dragging = null
    }
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      keys.current.add(e.code)
    }
    const ku = (e: KeyboardEvent) => keys.current.delete(e.code)
    const blur = () => keys.current.clear()
    dom.addEventListener('pointerdown', down)
    dom.addEventListener('pointermove', move)
    dom.addEventListener('pointerup', up)
    dom.addEventListener('pointercancel', up)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    return () => {
      dom.removeEventListener('pointerdown', down)
      dom.removeEventListener('pointermove', move)
      dom.removeEventListener('pointerup', up)
      dom.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', blur)
    }
  }, [dom])

  const walls = wallSegments(room.corners)
  const obstacles = furniture.filter((f) => !isWalkable(f))
  const free = (p: Vec2) =>
    pointInPolygon(p, room.corners) &&
    walls.every((w) => projectOnWall(p, w).distance >= BODY) &&
    obstacles.every((f) => !insideFootprint(p, f, BODY * 0.6))

  useFrame((_, dt) => {
    const k = keys.current
    let fwd = joystick.y
    let side = joystick.x
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1
    if (k.has('KeyD')) side += 1
    if (k.has('KeyA')) side -= 1
    if (k.has('ArrowLeft') || k.has('KeyQ')) look.current.yaw -= dt * 1.8
    if (k.has('ArrowRight') || k.has('KeyE')) look.current.yaw += dt * 1.8

    const { yaw, pitch } = look.current
    camera.rotation.set(-pitch, -yaw, 0, 'YXZ')

    const mag = Math.hypot(fwd, side)
    if (mag > 0.01) {
      const s = (Math.min(1, mag) / mag) * SPEED * Math.min(dt, 0.05)
      // Forward is -z rotated by the camera's yaw (rotation.y = -yaw).
      const fx = Math.sin(yaw)
      const fz = -Math.cos(yaw)
      const dx = (fx * fwd - fz * side) * s
      const dz = (fz * fwd + fx * side) * s
      const p = { x: camera.position.x, z: camera.position.z }
      const candidates = [
        { x: p.x + dx, z: p.z + dz },
        { x: p.x + dx, z: p.z },
        { x: p.x, z: p.z + dz },
      ]
      const next = candidates.find(free)
      // Starting somewhere blocked (e.g. inside furniture) should not trap you.
      if (next) camera.position.set(next.x, EYE_HEIGHT, next.z)
      else if (!free(p)) camera.position.set(p.x + dx, EYE_HEIGHT, p.z + dz)
    }
  })

  return null
}

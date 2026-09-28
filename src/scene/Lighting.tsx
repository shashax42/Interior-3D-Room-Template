import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { Room } from '../types'
import { bounds, centroid, wallSegments } from '../geometry/plan'

/** Soft indoor light: an image-based fill, a skylight, and daylight coming in through the first window. */
export function Lighting({ room, photoLit }: { room: Room; photoLit: boolean }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.45
    return () => {
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])

  const c = centroid(room.corners)
  const b = bounds(room.corners)
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ)

  // Sunlight enters through the first window if there is one, otherwise it falls from high up.
  const sun = useMemo(() => {
    const win = room.openings.find((o) => o.kind === 'window')
    if (!win) return new THREE.Vector3(c.x + 2, room.height + 4, c.z + 3)
    const w = wallSegments(room.corners)[win.wall]
    const at = { x: w.start.x + w.dir.x * win.offset, z: w.start.z + w.dir.z * win.offset }
    return new THREE.Vector3(at.x - w.inward.x * 3, win.sill + win.height + 1.8, at.z - w.inward.z * 3)
  }, [room, c.x, c.z])

  const target = useMemo(() => new THREE.Object3D(), [])

  return (
    <>
      <primitive object={target} position={[c.x, 0, c.z]} />
      <hemisphereLight args={['#fff6ee', '#d9cfc6', photoLit ? 0.5 : 0.9]} />
      <directionalLight
        position={sun}
        target={target}
        intensity={photoLit ? 0.8 : 1.6}
        color="#fff1e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={6}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
      />
      <pointLight position={[c.x, room.height - 0.25, c.z]} intensity={photoLit ? 0.6 : 1.4} distance={span * 2.5} decay={1.6} color="#ffe6c7" />
    </>
  )
}

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import type { FurnitureItem } from '../types'
import { GOLD } from './catalog'
import { surfaces } from '../scene/materials'
import { TRACE_MIRROR, TRACE_TRANSMISSION } from '../render/traceFlags'

// The princess / French room kit. Same conventions as models.tsx: each model fills
// [-w/2, w/2] × [0, h] × [-d/2, d/2] and faces +z.

type P = { item: FurnitureItem }
type V3 = [number, number, number]

const lighten = (hex: string, k: number) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString()
const darken = (hex: string, k: number) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#000000'), k).getHexString()

/** Soft cotton / linen with a faint sheen at grazing angles. */
export const Cotton = ({ color }: { color: string }) => (
  <meshPhysicalMaterial
    color={color}
    map={surfaces().linen.map}
    normalMap={surfaces().linen.normalMap}
    normalScale={[0.6, 0.6]}
    roughness={0.92}
    sheen={0.5}
    sheenRoughness={0.6}
    sheenColor="#ffffff"
  />
)
/** Velvet: dark in the middle, glowing at the edges. */
export const Velvet = ({ color }: { color: string }) => (
  <meshPhysicalMaterial
    color={color}
    normalMap={surfaces().velvet.normalMap}
    normalScale={[0.8, 0.8]}
    roughness={0.85}
    sheen={1}
    sheenRoughness={0.35}
    sheenColor={lighten(color, 0.55)}
  />
)
const Satin = ({ color }: { color: string }) => (
  <meshPhysicalMaterial color={color} roughness={0.35} sheen={0.8} sheenRoughness={0.2} sheenColor="#ffffff" clearcoat={0.2} />
)
const Tulle = ({ color, opacity = 0.45 }: { color: string; opacity?: number }) => (
  <meshStandardMaterial color={color} roughness={1} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
)
const Gilt = ({ color = GOLD }: { color?: string }) => <meshStandardMaterial color={color} metalness={1} roughness={0.25} />
const Paint = ({ color }: { color: string }) => <meshStandardMaterial color={color} roughness={0.45} />
const Marble = ({ color }: { color: string }) => (
  <meshPhysicalMaterial
    color={color}
    map={surfaces().marble.map}
    normalMap={surfaces().marble.normalMap}
    normalScale={[0.3, 0.3]}
    roughness={0.2}
    clearcoat={0.6}
    clearcoatRoughness={0.15}
  />
)

function RBox({ size, position, radius = 0.02, rotation, children }: { size: V3; position: V3; radius?: number; rotation?: V3; children: ReactNode }) {
  return (
    <RoundedBox
      args={size}
      radius={Math.min(radius, ...size.map((s) => s / 2 - 1e-4))}
      smoothness={4}
      position={position}
      rotation={rotation}
      castShadow
      receiveShadow
    >
      {children}
    </RoundedBox>
  )
}

/**
 * A gathered frill hanging from a straight edge: vertical folds that deepen toward the hem.
 * Placed with its top edge at y = 0, running along x, hanging down to y = -height.
 */
function ruffleGeometry(length: number, height: number, depth = 0.025, foldEvery = 0.045) {
  const g = new THREE.PlaneGeometry(length, height, Math.max(16, Math.round(length / 0.008)), 6)
  const pos = g.attributes.position
  const folds = Math.max(2, Math.round(length / foldEvery))
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const t = 0.5 - y / height // 0 at top, 1 at hem
    const phase = ((x / length + 0.5) * folds) * Math.PI * 2
    pos.setZ(i, Math.sin(phase) * depth * (0.35 + t * 0.9) + t * t * depth * 1.2)
    pos.setY(i, y - height / 2)
  }
  g.computeVertexNormals()
  return g
}

function Ruffle({ length, height, position, rotation, color, depth, lace }: {
  length: number
  height: number
  position: V3
  rotation?: V3
  color: string
  depth?: number
  lace?: boolean
}) {
  const geo = useMemo(() => ruffleGeometry(length, height, depth), [length, height, depth])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo} position={position} rotation={rotation} castShadow receiveShadow>
      {lace ? <Tulle color={color} opacity={0.85} /> : <meshPhysicalMaterial color={color} roughness={0.9} sheen={0.6} sheenColor="#fff" side={THREE.DoubleSide} />}
    </mesh>
  )
}

/** Frills on the left, right and foot of a w × d rectangle whose top edge is at height y. */
function SkirtRuffles({ w, d, y, height, color, lace }: { w: number; d: number; y: number; height: number; color: string; lace?: boolean }) {
  return (
    <group>
      <Ruffle length={w} height={height} position={[0, y, d / 2 + 0.005]} color={color} lace={lace} />
      <Ruffle length={d} height={height} position={[w / 2 + 0.005, y, 0]} rotation={[0, Math.PI / 2, 0]} color={color} lace={lace} />
      <Ruffle length={d} height={height} position={[-w / 2 - 0.005, y, 0]} rotation={[0, -Math.PI / 2, 0]} color={color} lace={lace} />
    </group>
  )
}

/** Curved furniture leg: out at the knee, in at the ankle. */
function CabrioleLeg({ h, r = 0.02, position, turn = 0, children }: { h: number; r?: number; position: V3; turn?: number; children: ReactNode }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, h, 0),
      new THREE.Vector3(0.02, h * 0.72, 0),
      new THREE.Vector3(-0.012, h * 0.3, 0),
      new THREE.Vector3(0.008, 0.02, 0),
      new THREE.Vector3(0.018, 0, 0),
    ])
    return new THREE.TubeGeometry(curve, 24, r, 10, false)
  }, [h, r])
  return (
    <mesh geometry={geo} position={position} rotation={[0, turn, 0]} castShadow>
      {children}
    </mesh>
  )
}

function Pillow({ w, h, d, position, color, rotation }: { w: number; h: number; d: number; position: V3; color: string; rotation?: V3 }) {
  return (
    <RBox size={[w, h, d]} position={position} radius={Math.min(h, d) * 0.48} rotation={rotation}>
      <Cotton color={color} />
    </RBox>
  )
}

/**
 * Mirror glass. Realtime shows polished metal reflecting the surroundings (a true mirror would redraw the whole
 * room again every frame); the photoreal render turns it into a perfect mirror.
 */
export function Mirror({ w, h, round }: { w: number; h: number; round?: boolean }) {
  return (
    <mesh userData={{ [TRACE_MIRROR]: true }} scale={round ? [w, h, 1] : [1, 1, 1]}>
      {round ? <circleGeometry args={[0.5, 48]} /> : <planeGeometry args={[w, h]} />}
      <meshStandardMaterial color="#e7ecee" metalness={1} roughness={0.04} />
    </mesh>
  )
}

/** An elliptical ring (a torus squashed into an oval) in the xy plane. */
function OvalRing({ rx, ry, tube, position, children }: { rx: number; ry: number; tube: number; position: V3; children: ReactNode }) {
  const geo = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, rx, ry, 0, Math.PI * 2, false, 0)
    const pts = curve.getSpacedPoints(96).map((p) => new THREE.Vector3(p.x, p.y, 0))
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 128, tube, 10, true)
  }, [rx, ry, tube])
  return (
    <mesh geometry={geo} position={position} castShadow>
      {children}
    </mesh>
  )
}

// ---------------------------------------------------------------------------------------------------------------

function CanopyBed({ item }: P) {
  const { w, d, h } = item.size
  const base = 0.34
  const top = base + 0.26
  const headH = 1.25
  const drape = useMemo(() => {
    // A tulle panel gathered at the crown and flaring out to the floor.
    const g = new THREE.PlaneGeometry(1, 1, 40, 40)
    const pos = g.attributes.position
    const len = h - 0.05
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5
      const v = 0.5 - pos.getY(i) // 0 top → 1 floor
      const width = 0.12 + Math.pow(v, 0.8) * 0.75
      const x = (u - 0.5) * width + v * 0.28
      const folds = Math.sin(u * Math.PI * 9) * (0.015 + v * 0.05)
      pos.setXYZ(i, x, -v * len, folds + v * 0.25 - v * v * 0.1)
    }
    g.computeVertexNormals()
    return g
  }, [h])
  useEffect(() => () => drape.dispose(), [drape])
  return (
    <group>
      {/* Base with two tiers of frills, lace over cotton */}
      <RBox size={[w, base, d]} position={[0, base / 2, 0]} radius={0.03}><Cotton color={item.color} /></RBox>
      <SkirtRuffles w={w + 0.02} d={d} y={base + 0.02} height={base} color={item.accent} />
      <SkirtRuffles w={w + 0.05} d={d + 0.02} y={base + 0.03} height={base * 0.55} color="#ffffff" lace />
      <RBox size={[w * 0.98, 0.26, d * 0.97]} position={[0, base + 0.13, 0.02]} radius={0.08}><Cotton color="#fffdfb" /></RBox>
      {/* Duvet with a frilled edge */}
      <RBox size={[w + 0.08, 0.12, d * 0.7]} position={[0, top + 0.03, d * 0.15]} radius={0.06}><Cotton color={item.color} /></RBox>
      <SkirtRuffles w={w + 0.1} d={d * 0.7} y={top + 0.06} height={0.14} color={item.accent} />
      {/* Folded-down top edge */}
      <RBox size={[w + 0.09, 0.07, 0.24]} position={[0, top + 0.07, -d * 0.2 + 0.03]} radius={0.035}><Cotton color={item.accent} /></RBox>
      {/* Tufted, rounded headboard */}
      <RBox size={[w + 0.12, headH, 0.12]} position={[0, headH / 2, -d / 2 + 0.06]} radius={0.06}><Velvet color={item.color} /></RBox>
      <mesh position={[0, headH - 0.02, -d / 2 + 0.06]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[(w + 0.12) / 2, (w + 0.12) / 2, 0.12, 48, 1, false, -Math.PI / 2, Math.PI]} />
        <Velvet color={item.color} />
      </mesh>
      {/* Pillows: two sleeping pillows, two frilled shams, one bolster */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Pillow w={w * 0.42} h={0.16} d={0.42} position={[s * w * 0.23, top + 0.16, -d / 2 + 0.36]} rotation={[-0.35, 0, 0]} color="#ffffff" />
          <Pillow w={w * 0.36} h={0.13} d={0.36} position={[s * w * 0.2, top + 0.14, -d / 2 + 0.52]} rotation={[-0.3, 0, 0]} color={item.accent} />
        </group>
      ))}
      <mesh position={[0, top + 0.09, -d / 2 + 0.72]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.08, w * 0.35, 8, 16]} />
        <Satin color={item.accent} />
      </mesh>
      {/* Crown canopy above the head, tulle falling to both sides */}
      <group position={[0, h - 0.08, -d / 2 + 0.12]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.32, 0.018, 12, 48, Math.PI]} />
          <Gilt />
        </mesh>
        <mesh position={[0, 0.06, 0]}>
          <sphereGeometry args={[0.07, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <Gilt />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={drape} position={[s * 0.18, 0, 0.02]} scale={[s, 1, 1]}>
            <Tulle color={lighten(item.accent, 0.4)} opacity={0.5} />
          </mesh>
        ))}
        <Ruffle length={0.7} height={0.16} position={[0, 0, 0.3]} color={lighten(item.accent, 0.3)} lace />
      </group>
    </group>
  )
}

function ScallopBed({ item }: P) {
  const { w, d, h } = item.size
  const base = 0.36
  const top = base + 0.24
  const petals = Math.max(5, Math.round(w / 0.24))
  return (
    <group>
      <RBox size={[w, base, d]} position={[0, base / 2, 0]} radius={0.06}><Velvet color={item.color} /></RBox>
      <RBox size={[w * 0.96, 0.24, d * 0.95]} position={[0, base + 0.12, 0.03]} radius={0.08}><Cotton color="#fbf8f4" /></RBox>
      <RBox size={[w + 0.04, 0.1, d * 0.62]} position={[0, top + 0.02, d * 0.18]} radius={0.05}><Cotton color={item.accent} /></RBox>
      {/* Throw across the foot */}
      <RBox size={[w + 0.08, 0.05, 0.5]} position={[0, top + 0.08, d / 2 - 0.35]} radius={0.025}><Cotton color={lighten(item.color, 0.2)} /></RBox>
      {/* Channel-tufted scallop headboard: rounded petals rising toward the middle */}
      {Array.from({ length: petals }, (_, i) => {
        const t = (i + 0.5) / petals - 0.5
        const ph = h * (0.78 + 0.22 * Math.cos(t * Math.PI))
        const pw = w / petals
        return (
          <mesh key={i} position={[t * w, ph / 2 + 0.02, -d / 2 + 0.07]} castShadow receiveShadow>
            <capsuleGeometry args={[pw / 2 - 0.004, ph - pw, 8, 20]} />
            <Velvet color={item.color} />
          </mesh>
        )
      })}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Pillow w={w * 0.4} h={0.17} d={0.45} position={[s * w * 0.22, top + 0.17, -d / 2 + 0.36]} rotation={[-0.4, 0, 0]} color="#fbf6ef" />
          <Pillow w={0.42} h={0.14} d={0.42} position={[s * w * 0.14, top + 0.13, -d / 2 + 0.55]} rotation={[-0.25, 0, s * 0.1]} color={item.color} />
        </group>
      ))}
      <Pillow w={0.36} h={0.12} d={0.3} position={[0, top + 0.12, -d / 2 + 0.66]} rotation={[-0.2, 0, 0]} color="#8fb8ad" />
    </group>
  )
}

function Vanity({ item }: P) {
  const { w, d, h } = item.size
  const t = 0.76
  const mirrorH = h - t - 0.1
  return (
    <group>
      <RBox size={[w, 0.035, d]} position={[0, t - 0.0175, 0]} radius={0.012}><Paint color={item.color} /></RBox>
      <RBox size={[w - 0.06, 0.15, d - 0.05]} position={[0, t - 0.11, -0.01]} radius={0.01}><Paint color={item.color} /></RBox>
      {[-1, 0, 1].map((s) => (
        <mesh key={s} position={[s * w * 0.3, t - 0.11, d / 2 - 0.02]}>
          <sphereGeometry args={[0.014, 12, 12]} />
          <Gilt color={item.accent} />
        </mesh>
      ))}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <CabrioleLeg key={`${sx}${sz}`} h={t - 0.18} position={[sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05)]} turn={Math.atan2(sz, -sx)}>
            <Paint color={item.color} />
          </CabrioleLeg>
        )),
      )}
      {/* Oval mirror on a stand */}
      <group position={[0, t + 0.08 + mirrorH / 2, -d / 2 + 0.08]}>
        <OvalRing rx={w * 0.3} ry={mirrorH / 2} tube={0.022} position={[0, 0, 0]}><Gilt color={item.accent} /></OvalRing>
        <group position={[0, 0, 0.004]}>
          <Mirror w={w * 0.58} h={mirrorH - 0.04} round />
        </group>
        <mesh position={[0, mirrorH / 2 + 0.03, 0]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.06, 0.012, 8, 24, Math.PI]} />
          <Gilt color={item.accent} />
        </mesh>
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * w * 0.3, t + 0.05, -d / 2 + 0.08]}>
          <cylinderGeometry args={[0.012, 0.018, 0.1, 10]} />
          <Gilt color={item.accent} />
        </mesh>
      ))}
    </group>
  )
}

/** Gray drapes to the floor with a pink balloon shade gathered in soft scallops over the top half. */
function BalloonCurtain({ item }: P) {
  const { w, d, h } = item.size
  const scallops = Math.max(2, Math.round(w / 0.7))
  const shadeH = h * 0.5
  const shade = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, shadeH, Math.max(48, Math.round(w * 60)), 40)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const u = x / w + 0.5
      const v = 0.5 - y / shadeH // 0 top → 1 hem
      // Between gather lines the fabric sags into a scallop and puffs out toward the room.
      // |sin|^0.7 gives rounder, fuller poufs than sin², which reads as pointy swags.
      const sag = Math.pow(Math.abs(Math.sin(u * Math.PI * scallops)), 0.7)
      const hem = 1 - 0.35 * (1 - sag)
      const vv = v * hem
      const puff = Math.sin(Math.min(1, v / hem) * Math.PI) * sag * 0.09 * Math.min(1, v * 1.6)
      const ruche = Math.sin(vv * 38) * 0.008 * vv
      const pleat = Math.sin(u * Math.PI * w * 26) * 0.01
      pos.setXYZ(i, x, shadeH / 2 - vv * shadeH, puff + ruche + pleat + 0.02 * vv)
    }
    g.computeVertexNormals()
    return g
  }, [w, shadeH, scallops])
  const drape = useMemo(() => {
    const pw = w * 0.3
    const g = new THREE.PlaneGeometry(pw, h - 0.06, 36, 12)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      pos.setZ(i, Math.sin((x / pw) * Math.PI * 7) * 0.03)
    }
    g.computeVertexNormals()
    return g
  }, [w, h])
  useEffect(() => () => { shade.dispose(); drape.dispose() }, [shade, drape])
  return (
    <group>
      <mesh position={[0, h - 0.03, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.014, 0.014, w + 0.25, 12]} />
        <Gilt />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={drape} position={[s * (w / 2 - w * 0.15 + 0.08), (h - 0.06) / 2, -d / 2 + 0.03]} castShadow>
          <meshPhysicalMaterial color={item.accent} roughness={0.85} sheen={1} sheenRoughness={0.35} sheenColor={lighten(item.accent, 0.5)} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh geometry={shade} position={[0, h - 0.05 - shadeH / 2, d / 2 - 0.1]} castShadow>
        <meshPhysicalMaterial color={item.color} roughness={0.9} sheen={0.7} sheenColor="#ffffff" side={THREE.DoubleSide} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

/** Oval gilt mirror with rococo scrolls around the frame and a crest on top. */
function OrnateMirror({ item }: P) {
  const { w, d, h } = item.size
  const rx = w / 2 - 0.05
  const ry = h / 2 - 0.08
  const scrolls = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 10
        return { x: Math.cos(a) * (rx + 0.025), y: Math.sin(a) * (ry + 0.025), a }
      }),
    [rx, ry],
  )
  return (
    <group position={[0, h / 2, 0]}>
      <OvalRing rx={rx} ry={ry} tube={0.028} position={[0, 0, 0]}><Gilt color={item.color} /></OvalRing>
      <OvalRing rx={rx - 0.035} ry={ry - 0.035} tube={0.01} position={[0, 0, 0.01]}><Gilt color={item.color} /></OvalRing>
      {scrolls.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, 0.01]} rotation={[0, 0, s.a]}>
          <torusGeometry args={[0.03, 0.009, 8, 16, Math.PI * 1.4]} />
          <Gilt color={item.color} />
        </mesh>
      ))}
      {/* Crest: a shell of arcs with a bow knot */}
      {[0.05, 0.08, 0.11].map((r, i) => (
        <mesh key={i} position={[0, ry + 0.02, 0.01]}>
          <torusGeometry args={[r, 0.01, 8, 24, Math.PI]} />
          <Gilt color={item.color} />
        </mesh>
      ))}
      <mesh position={[0, -ry - 0.03, 0.01]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.06, 0.012, 8, 24, Math.PI]} />
        <Gilt color={item.color} />
      </mesh>
      <group position={[0, 0, -d / 2 + 0.02]}>
        <Mirror w={rx * 2} h={ry * 2} round />
      </group>
    </group>
  )
}

function Flame({ position, seed }: { position: V3; seed: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 9 + seed * 10
    const k = 1 + Math.sin(t) * 0.08 + Math.sin(t * 2.3) * 0.05
    ref.current?.scale.set(1, k, 1)
  })
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.007, 10, 10]} />
      <meshBasicMaterial color="#ffd27a" toneMapped={false} />
    </mesh>
  )
}

function Candles({ item }: P) {
  const { w, d } = item.size
  const light = useRef<THREE.PointLight>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (light.current) light.current.intensity = 0.55 + Math.sin(t * 11) * 0.06 + Math.sin(t * 7.3) * 0.05
  })
  const set = [
    { x: -w * 0.28, z: 0.01, r: 0.035, ch: 0.16 },
    { x: 0.02, z: -d * 0.12, r: 0.04, ch: 0.2 },
    { x: w * 0.3, z: d * 0.15, r: 0.03, ch: 0.11 },
  ]
  return (
    <group>
      <mesh position={[0, 0.006, 0]} receiveShadow>
        <cylinderGeometry args={[w * 0.55, w * 0.55, 0.012, 40]} />
        <Gilt color={item.accent} />
      </mesh>
      {set.map((c, i) => (
        <group key={i} position={[c.x, 0.012, c.z]}>
          <mesh position={[0, c.ch / 2, 0]} castShadow>
            <cylinderGeometry args={[c.r, c.r, c.ch, 24]} />
            <meshPhysicalMaterial color={item.color} roughness={0.6} userData={{ [TRACE_TRANSMISSION]: 0.2 }} />
          </mesh>
          <Flame position={[0, c.ch + 0.014, 0]} seed={i} />
        </group>
      ))}
      <pointLight ref={light} position={[0, 0.3, 0]} distance={2.2} decay={2} color="#ffb867" />
    </group>
  )
}

function Plush({ item }: P) {
  const { w, h } = item.size
  const k = h / 0.38
  const fur = <meshPhysicalMaterial color={item.color} roughness={1} sheen={1} sheenRoughness={0.8} sheenColor="#ffffff" />
  return (
    <group scale={[w / 0.26, k, k]}>
      <mesh position={[0, 0.09, 0]} scale={[1, 0.95, 0.85]} castShadow>
        <sphereGeometry args={[0.1, 24, 18]} />
        {fur}
      </mesh>
      <mesh position={[0, 0.215, 0.015]} castShadow>
        <sphereGeometry args={[0.075, 24, 18]} />
        {fur}
      </mesh>
      {/* Long floppy ears */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.045, 0.27, 0.0]} rotation={[0.25, 0, s * 0.75]}>
          <mesh position={[0, -0.07, 0]} scale={[1, 1, 0.45]} castShadow>
            <capsuleGeometry args={[0.028, 0.13, 6, 12]} />
            {fur}
          </mesh>
          <mesh position={[0, -0.07, 0.012]} scale={[0.6, 0.9, 0.2]}>
            <capsuleGeometry args={[0.028, 0.12, 6, 12]} />
            <meshStandardMaterial color={item.accent} roughness={1} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`f${s}`} position={[s * 0.05, 0.025, 0.07]} scale={[1, 0.7, 1.4]} castShadow>
          <sphereGeometry args={[0.035, 14, 12]} />
          {fur}
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`e${s}`} position={[s * 0.025, 0.23, 0.083]}>
          <sphereGeometry args={[0.007, 8, 8]} />
          <meshStandardMaterial color="#2a2324" roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0.205, 0.088]}>
        <sphereGeometry args={[0.007, 8, 8]} />
        <meshStandardMaterial color={item.accent} />
      </mesh>
    </group>
  )
}

/** Satin ribbon bow: two loops, a knot and two tails. */
function Bow({ item }: P) {
  const { w, h } = item.size
  const s = w / 0.34
  return (
    <group position={[0, h * 0.62, 0]} scale={[s, h / 0.4, s]}>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.075, 0.01, 0]} rotation={[0, 0, sx * 0.2]} scale={[1.25, 0.8, 0.35]} castShadow>
          <torusGeometry args={[0.055, 0.018, 12, 32]} />
          <Satin color={item.color} />
        </mesh>
      ))}
      <mesh scale={[1, 1, 0.6]} castShadow>
        <sphereGeometry args={[0.026, 16, 12]} />
        <Satin color={item.color} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={`t${sx}`} position={[sx * 0.045, -0.12, 0]} rotation={[0, 0, sx * 0.3]} castShadow>
          <boxGeometry args={[0.035, 0.2, 0.006]} />
          <Satin color={item.color} />
        </mesh>
      ))}
    </group>
  )
}

function TableLamp({ item }: P) {
  const { w, h } = item.size
  const baseH = h * 0.5
  const vase = useMemo(() => {
    const pts = [
      [0.001, 0], [w * 0.2, 0], [w * 0.22, 0.02], [w * 0.3, baseH * 0.3], [w * 0.26, baseH * 0.62], [w * 0.1, baseH * 0.85], [w * 0.06, baseH],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    return new THREE.LatheGeometry(pts, 40)
  }, [w, baseH])
  const shade = useMemo(() => {
    // Pleated shade: the radius ripples around the circumference.
    const shadeH = h - baseH - 0.02
    const g = new THREE.CylinderGeometry(w * 0.3, w / 2, shadeH, 96, 4, true)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const a = Math.atan2(z, x)
      const k = 1 + Math.sin(a * 32) * 0.025
      pos.setX(i, x * k)
      pos.setZ(i, z * k)
    }
    g.computeVertexNormals()
    return g
  }, [w, h, baseH])
  useEffect(() => () => { vase.dispose(); shade.dispose() }, [vase, shade])
  return (
    <group>
      <mesh geometry={vase} castShadow>
        <meshPhysicalMaterial color={item.color} roughness={0.15} clearcoat={0.8} />
      </mesh>
      <mesh geometry={shade} position={[0, baseH + (h - baseH) / 2 + 0.01, 0]}>
        <meshStandardMaterial color={item.accent} roughness={0.9} side={THREE.DoubleSide} emissive={item.accent} emissiveIntensity={0.55} transparent opacity={0.95} />
      </mesh>
      <pointLight position={[0, baseH + 0.08, 0]} intensity={0.9} distance={3} decay={2} color="#ffd8a8" />
    </group>
  )
}

/** Round rug with a scalloped edge and a soft pile. */
function ShagRug({ item }: P) {
  const { w, d, h } = item.size
  const geo = useMemo(() => {
    const shape = new THREE.Shape()
    const n = 240
    const lobes = Math.max(10, Math.round((Math.PI * w) / 0.22))
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2
      const r = 0.5 * (1 - 0.035 * (1 - Math.abs(Math.sin((a * lobes) / 2))))
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.012, bevelSegments: 3 })
    g.rotateX(-Math.PI / 2)
    return g
  }, [w])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <group>
      <mesh geometry={geo} scale={[w, h * 0.6, d]} receiveShadow>
        <meshPhysicalMaterial color={item.color} roughness={1} sheen={1} sheenRoughness={0.9} sheenColor="#ffffff" />
      </mesh>
      <mesh position={[0, h * 0.95, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[w, d, 1]}>
        <ringGeometry args={[0.36, 0.38, 96]} />
        <meshStandardMaterial color={item.accent} roughness={1} />
      </mesh>
    </group>
  )
}

/** Louis XVI bergère: oval back, carved painted frame, cabriole legs. */
function LouisChair({ item }: P) {
  const { w, d, h } = item.size
  const seat = 0.44
  const backH = h - seat - 0.02
  return (
    <group>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <CabrioleLeg key={`${sx}${sz}`} h={seat - 0.1} r={0.022} position={[sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.07)]} turn={Math.atan2(sz, -sx)}>
            <Paint color={item.color} />
          </CabrioleLeg>
        )),
      )}
      <RBox size={[w - 0.04, 0.09, d - 0.06]} position={[0, seat - 0.12, 0.01]} radius={0.03}><Paint color={item.color} /></RBox>
      <RBox size={[w - 0.1, 0.12, d - 0.14]} position={[0, seat - 0.02, 0.04]} radius={0.05}><Cotton color={item.accent} /></RBox>
      {/* Oval back: carved frame around an upholstered panel */}
      <group position={[0, seat + backH / 2, -d / 2 + 0.07]} rotation={[-0.12, 0, 0]}>
        <OvalRing rx={w / 2 - 0.06} ry={backH / 2} tube={0.025} position={[0, 0, 0]}><Paint color={item.color} /></OvalRing>
        <mesh scale={[w / 2 - 0.07, backH / 2 - 0.02, 0.05]} castShadow>
          <sphereGeometry args={[1, 32, 16]} />
          <Cotton color={item.accent} />
        </mesh>
        <mesh position={[0, backH / 2 + 0.02, 0]}>
          <torusGeometry args={[0.04, 0.01, 8, 20, Math.PI]} />
          <Paint color={item.color} />
        </mesh>
      </group>
      {/* Arms */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <RBox size={[0.06, 0.05, d * 0.6]} position={[s * (w / 2 - 0.04), seat + 0.2, 0]} radius={0.02}><Cotton color={item.accent} /></RBox>
          <mesh position={[s * (w / 2 - 0.04), seat + 0.08, d * 0.25]} castShadow>
            <cylinderGeometry args={[0.018, 0.022, 0.24, 12]} />
            <Paint color={item.color} />
          </mesh>
        </group>
      ))}
      <Pillow w={0.36} h={0.12} d={0.3} position={[0, seat + 0.18, -d / 2 + 0.2]} rotation={[-0.3, 0, 0]} color={lighten(item.accent, 0.3)} />
    </group>
  )
}

/** Fluted Corinthian column used as a side table. */
function Pedestal({ item }: P) {
  const { w, h } = item.size
  const shaft = useMemo(() => {
    const g = new THREE.CylinderGeometry(w * 0.3, w * 0.34, h * 0.62, 72, 8)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const r = Math.hypot(x, z)
      if (r < 1e-4) continue
      const a = Math.atan2(z, x)
      const k = 1 - Math.pow(Math.abs(Math.sin(a * 8)), 3) * 0.06
      pos.setX(i, x * k)
      pos.setZ(i, z * k)
    }
    g.computeVertexNormals()
    return g
  }, [w, h])
  useEffect(() => () => shaft.dispose(), [shaft])
  const plinth = h * 0.1
  return (
    <group>
      <RBox size={[w, plinth * 0.5, w]} position={[0, plinth * 0.25, 0]} radius={0.006}><Marble color={item.color} /></RBox>
      <mesh position={[0, plinth * 0.75, 0]} castShadow>
        <cylinderGeometry args={[w * 0.38, w * 0.44, plinth * 0.5, 48]} />
        <Marble color={item.color} />
      </mesh>
      <mesh geometry={shaft} position={[0, plinth + h * 0.31, 0]} castShadow receiveShadow>
        <Marble color={item.color} />
      </mesh>
      {/* Capital: flared bell with volutes at the corners */}
      <mesh position={[0, plinth + h * 0.62 + h * 0.08, 0]} castShadow>
        <cylinderGeometry args={[w * 0.46, w * 0.3, h * 0.16, 48]} />
        <Marble color={item.accent} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        return (
          <mesh key={i} position={[Math.cos(a) * w * 0.42, plinth + h * 0.74, Math.sin(a) * w * 0.42]} rotation={[0, -a + Math.PI / 2, 0]}>
            <torusGeometry args={[0.025, 0.009, 8, 16]} />
            <Marble color={item.color} />
          </mesh>
        )
      })}
      <RBox size={[w, h - (plinth + h * 0.78), w]} position={[0, (h + plinth + h * 0.78) / 2, 0]} radius={0.005}><Marble color={item.color} /></RBox>
    </group>
  )
}

/** Cloud of blown-glass bubbles hanging from a small gilt canopy. */
function BubbleChandelier({ item }: P) {
  const { w, h } = item.size
  const bubbles = useMemo(() => {
    let seed = 5
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    return Array.from({ length: 34 }, () => {
      const a = rnd() * Math.PI * 2
      const r = Math.sqrt(rnd()) * w * 0.38
      const y = h * 0.28 + (rnd() - 0.5) * h * 0.32 - (r / w) * 0.15
      return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, s: 0.06 + rnd() * 0.07 }
    })
  }, [w, h])
  return (
    <group>
      <mesh position={[0, h - 0.015, 0]}>
        <cylinderGeometry args={[0.08, 0.06, 0.03, 32]} />
        <Gilt color={item.color} />
      </mesh>
      <mesh position={[0, h * 0.72, 0]}>
        <cylinderGeometry args={[0.008, 0.008, h * 0.5, 8]} />
        <Gilt color={item.color} />
      </mesh>
      {bubbles.map((b, i) => (
        <mesh key={i} position={[b.x, b.y, b.z]}>
          <sphereGeometry args={[b.s, 24, 16]} />
          <meshPhysicalMaterial
            color={item.accent}
            roughness={0.25}
            transparent
            opacity={0.55}
            thickness={0.2}
            ior={1.4}
            emissive="#fff4e0"
            emissiveIntensity={0.35}
            userData={{ [TRACE_TRANSMISSION]: 0.6 }}
          />
        </mesh>
      ))}
      <pointLight position={[0, h * 0.28, 0]} intensity={4.5} distance={7} decay={2} color="#ffe2b8" />
    </group>
  )
}

function Bench({ item }: P) {
  const { w, d, h } = item.size
  const tufts = Math.max(3, Math.round(w / 0.2))
  return (
    <group>
      <RBox size={[w, h - 0.08, d]} position={[0, (h - 0.08) / 2 + 0.08, 0]} radius={0.08}><Velvet color={item.color} /></RBox>
      {/* Channel lines */}
      {Array.from({ length: tufts - 1 }, (_, i) => (
        <mesh key={i} position={[-w / 2 + (w / tufts) * (i + 1), h - 0.004, 0]}>
          <boxGeometry args={[0.006, 0.006, d - 0.08]} />
          <meshStandardMaterial color={darken(item.color, 0.25)} roughness={1} />
        </mesh>
      ))}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (w / 2 - 0.08), 0.04, sz * (d / 2 - 0.07)]} castShadow>
            <cylinderGeometry args={[0.018, 0.012, 0.08, 12]} />
            <Gilt color={item.accent} />
          </mesh>
        )),
      )}
    </group>
  )
}

/** Carved marble mantel with a dark firebox and candles on the shelf. */
function Fireplace({ item }: P) {
  const { w, d, h } = item.size
  const openW = w * 0.52
  const openH = h * 0.6
  const side = (w - openW) / 2
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <RBox size={[side, h - 0.08, d * 0.8]} position={[s * (openW / 2 + side / 2), (h - 0.08) / 2, -d * 0.1]} radius={0.01}><Marble color={item.color} /></RBox>
          {/* Pilaster with scroll corbel */}
          <RBox size={[side * 0.5, h * 0.72, 0.04]} position={[s * (openW / 2 + side / 2), h * 0.36 + 0.02, d * 0.32]} radius={0.01}><Marble color={item.color} /></RBox>
          <mesh position={[s * (openW / 2 + side / 2), h * 0.8, d * 0.34]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.045, 0.014, 8, 20, Math.PI * 1.5]} />
            <Marble color={item.color} />
          </mesh>
        </group>
      ))}
      <RBox size={[openW, h - 0.08 - openH, d * 0.8]} position={[0, openH + (h - 0.08 - openH) / 2, -d * 0.1]} radius={0.01}><Marble color={item.color} /></RBox>
      {/* Carved frieze: a row of small medallions */}
      {[-2, -1, 0, 1, 2].map((i) => (
        <mesh key={i} position={[i * openW * 0.18, openH + (h - openH) * 0.4, d * 0.31]}>
          <sphereGeometry args={[i === 0 ? 0.04 : 0.022, 16, 12]} />
          <Marble color={item.color} />
        </mesh>
      ))}
      <RBox size={[w + 0.12, 0.06, d + 0.08]} position={[0, h - 0.03, 0.02]} radius={0.015}><Marble color={item.color} /></RBox>
      <mesh position={[0, openH / 2, -d * 0.2]}>
        <boxGeometry args={[openW, openH, d * 0.5]} />
        <meshStandardMaterial color="#2c2624" roughness={1} />
      </mesh>
      {/* Decorative screen in the opening, in the accent color */}
      <mesh position={[0, openH * 0.42, d * 0.12]} castShadow>
        <boxGeometry args={[openW * 0.8, openH * 0.8, 0.02]} />
        <meshStandardMaterial color={item.accent} roughness={0.7} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[-openW * 0.32 + (openW * 0.64 * i) / 4, openH * 0.42, d * 0.132]}>
          <boxGeometry args={[0.035, openH * 0.72, 0.004]} />
          <meshStandardMaterial color="#fbf8f2" roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

export function PrincessModel({ item }: P) {
  switch (item.kind) {
    case 'canopyBed': return <CanopyBed item={item} />
    case 'scallopBed': return <ScallopBed item={item} />
    case 'vanity': return <Vanity item={item} />
    case 'balloonCurtain': return <BalloonCurtain item={item} />
    case 'ornateMirror': return <OrnateMirror item={item} />
    case 'candles': return <Candles item={item} />
    case 'plush': return <Plush item={item} />
    case 'bow': return <Bow item={item} />
    case 'tableLamp': return <TableLamp item={item} />
    case 'shagRug': return <ShagRug item={item} />
    case 'louisChair': return <LouisChair item={item} />
    case 'pedestal': return <Pedestal item={item} />
    case 'bubbleChandelier': return <BubbleChandelier item={item} />
    case 'bench': return <Bench item={item} />
    case 'fireplace': return <Fireplace item={item} />
    default: return null
  }
}

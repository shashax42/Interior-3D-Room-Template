import { useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import type { FurnitureItem } from '../types'
import { GOLD } from './catalog'
import { Cotton, Mirror, PrincessModel } from './princess'
import { TRACE_TRANSMISSION } from '../render/traceFlags'

// Every model is built inside the box [-w/2, w/2] × [0, h] × [-d/2, d/2], with its front facing +z.

type P = { item: FurnitureItem }

const Fabric = Cotton
const Wood = ({ color }: { color: string }) => <meshStandardMaterial color={color} roughness={0.55} />
const Metal = ({ color = GOLD }: { color?: string }) => <meshStandardMaterial color={color} metalness={1} roughness={0.28} />

function Box({ size, position, children, radius = 0 }: {
  size: [number, number, number]
  position: [number, number, number]
  children: ReactNode
  radius?: number
}) {
  if (radius > 0) {
    return (
      <RoundedBox args={size} radius={Math.min(radius, ...size.map((s) => s / 2 - 1e-4))} smoothness={3} position={position} castShadow receiveShadow>
        {children}
      </RoundedBox>
    )
  }
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      {children}
    </mesh>
  )
}

function Cyl({ r, h, position, children, r2, segments = 24 }: {
  r: number
  h: number
  position: [number, number, number]
  children: ReactNode
  r2?: number
  segments?: number
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <cylinderGeometry args={[r2 ?? r, r, h, segments]} />
      {children}
    </mesh>
  )
}

function Legs({ w, d, h, inset, r, children }: { w: number; d: number; h: number; inset: number; r: number; children: ReactNode }) {
  const xs = [-w / 2 + inset, w / 2 - inset]
  const zs = [-d / 2 + inset, d / 2 - inset]
  return (
    <>
      {xs.flatMap((x) => zs.map((z) => <Cyl key={`${x}${z}`} r={r} r2={r * 0.8} h={h} position={[x, h / 2, z]}>{children}</Cyl>))}
    </>
  )
}

function Bed({ item }: P) {
  const { w, d, h } = item.size
  const base = 0.32
  const mattress = 0.22
  const top = base + mattress
  return (
    <group>
      <Box size={[w, base, d]} position={[0, base / 2, 0]} radius={0.03}><Fabric color={item.color} /></Box>
      {/* Ruffled skirt */}
      <Box size={[w + 0.03, base - 0.06, d + 0.015]} position={[0, (base - 0.06) / 2 + 0.02, 0.0075]} radius={0.02}><Fabric color={item.accent} /></Box>
      <Box size={[w * 0.97, mattress, d * 0.96]} position={[0, base + mattress / 2, 0.02]} radius={0.06}><Fabric color="#fbf8f4" /></Box>
      {/* Duvet over the lower two thirds */}
      <Box size={[w + 0.06, 0.09, d * 0.66]} position={[0, top + 0.02, d * 0.17 + 0.03]} radius={0.04}><Fabric color={item.color} /></Box>
      <Box size={[w + 0.07, 0.05, 0.2]} position={[0, top + 0.035, -d * 0.16 + 0.03]} radius={0.025}><Fabric color={item.accent} /></Box>
      {/* Headboard */}
      <Box size={[w + 0.08, h, 0.08]} position={[0, h / 2, -d / 2 + 0.04]} radius={0.04}><Fabric color={item.color} /></Box>
      {[-1, 1].map((s) => (
        <Box key={s} size={[w * 0.4, 0.14, 0.4]} position={[s * w * 0.23, top + 0.08, -d / 2 + 0.33]} radius={0.07}><Fabric color="#ffffff" /></Box>
      ))}
    </group>
  )
}

function Sofa({ item }: P) {
  const { w, d, h } = item.size
  const seat = 0.42
  const arm = 0.18
  const back = 0.2
  const inner = w - arm * 2
  const n = Math.max(1, Math.round(inner / 0.62))
  return (
    <group>
      <Box size={[w, 0.2, d]} position={[0, 0.16, 0]} radius={0.03}><Fabric color={item.color} /></Box>
      {Array.from({ length: n }, (_, i) => (
        <Box key={i} size={[inner / n - 0.01, 0.16, d - back]} position={[-inner / 2 + (inner / n) * (i + 0.5), seat - 0.08 + 0.02, back / 2]} radius={0.05}><Fabric color={item.color} /></Box>
      ))}
      <Box size={[w, h - 0.06, back]} position={[0, (h - 0.06) / 2 + 0.06, -d / 2 + back / 2]} radius={0.06}><Fabric color={item.color} /></Box>
      {[-1, 1].map((s) => (
        <Box key={s} size={[arm, 0.62, d]} position={[s * (w / 2 - arm / 2), 0.31 + 0.06, 0]} radius={0.06}><Fabric color={item.color} /></Box>
      ))}
      {[-1, 1].map((s) => (
        <Box key={`p${s}`} size={[0.42, 0.42, 0.12]} position={[s * (inner / 2 - 0.3), seat + 0.24, -d / 2 + back + 0.08]} radius={0.06}><Fabric color={item.accent} /></Box>
      ))}
      <Legs w={w} d={d} h={0.06} inset={0.08} r={0.02}><Wood color="#6b4e3a" /></Legs>
    </group>
  )
}

function Armchair({ item }: P) {
  const { w, d, h } = item.size
  return (
    <group>
      <Legs w={w} d={d} h={0.16} inset={0.08} r={0.022}><Wood color={item.accent} /></Legs>
      <Box size={[w, 0.24, d]} position={[0, 0.28, 0]} radius={0.06}><Fabric color={item.color} /></Box>
      <Box size={[w, h - 0.16, 0.18]} position={[0, (h - 0.16) / 2 + 0.16, -d / 2 + 0.09]} radius={0.08}><Fabric color={item.color} /></Box>
      {[-1, 1].map((s) => (
        <Box key={s} size={[0.14, 0.3, d * 0.9]} position={[s * (w / 2 - 0.07), 0.55, 0.02]} radius={0.06}><Fabric color={item.color} /></Box>
      ))}
    </group>
  )
}

function DiningTable({ item }: P) {
  const { w, d, h } = item.size
  return (
    <group>
      <Box size={[w, 0.04, d]} position={[0, h - 0.02, 0]} radius={0.01}><Wood color={item.color} /></Box>
      <Legs w={w} d={d} h={h - 0.04} inset={0.07} r={0.025}><Wood color={item.accent} /></Legs>
    </group>
  )
}

function Chair({ item }: P) {
  const { w, d, h } = item.size
  const seat = 0.46
  return (
    <group>
      <Legs w={w} d={d} h={seat - 0.04} inset={0.04} r={0.016}><Wood color={item.accent} /></Legs>
      <Box size={[w, 0.06, d]} position={[0, seat - 0.02, 0]} radius={0.02}><Fabric color={item.color} /></Box>
      <Box size={[w, h - seat, 0.05]} position={[0, seat + (h - seat) / 2, -d / 2 + 0.03]} radius={0.02}><Fabric color={item.color} /></Box>
    </group>
  )
}

function Desk({ item }: P) {
  const { w, d, h } = item.size
  return (
    <group>
      <Box size={[w, 0.035, d]} position={[0, h - 0.0175, 0]} radius={0.008}><Wood color={item.color} /></Box>
      <Box size={[w * 0.35, 0.12, d * 0.9]} position={[w * 0.28, h - 0.1, 0]}><Wood color={item.color} /></Box>
      <Box size={[0.08, 0.012, 0.012]} position={[w * 0.28, h - 0.1, d * 0.45 + 0.006]}><Metal color={item.accent} /></Box>
      <Legs w={w} d={d} h={h - 0.035} inset={0.04} r={0.017}><Wood color={item.color} /></Legs>
    </group>
  )
}

function Cabinet({ item, rows, cols, legs }: P & { rows: number; cols: number; legs: number }) {
  const { w, d, h } = item.size
  const body = h - legs
  const gap = 0.006
  const cw = w / cols
  const rh = (body - 0.04) / rows
  return (
    <group>
      {legs > 0 && <Legs w={w} d={d} h={legs} inset={0.05} r={0.018}><Metal color={item.accent} /></Legs>}
      <Box size={[w, body, d]} position={[0, legs + body / 2, 0]} radius={0.008}><Wood color={item.color} /></Box>
      {Array.from({ length: rows }).flatMap((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const x = -w / 2 + cw * (c + 0.5)
          const y = legs + 0.02 + rh * (r + 0.5)
          return (
            <group key={`${r}-${c}`}>
              <Box size={[cw - gap * 2, rh - gap * 2, 0.012]} position={[x, y, d / 2 + 0.006]} radius={0.004}><Wood color={item.color} /></Box>
              {rows === 1 ? (
                <Box size={[0.012, Math.min(0.3, rh * 0.25), 0.02]} position={[x + (c % 2 === 0 ? cw / 2 - 0.05 : -cw / 2 + 0.05), y, d / 2 + 0.02]}><Metal color={item.accent} /></Box>
              ) : (
                <mesh position={[x, y, d / 2 + 0.022]} castShadow>
                  <sphereGeometry args={[0.016, 12, 12]} />
                  <Metal color={item.accent} />
                </mesh>
              )}
            </group>
          )
        }),
      )}
    </group>
  )
}

const BOOK_COLORS = ['#b7775e', '#e2cfb4', '#8a9a8b', '#d9a6a1', '#f2ede6', '#6c7a91']

function Bookshelf({ item }: P) {
  const { w, d, h } = item.size
  const t = 0.022
  const shelves = Math.max(2, Math.round(h / 0.36))
  const books = useMemo(() => {
    const out: { x: number; y: number; bw: number; bh: number; c: string }[] = []
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let s = 0; s < shelves; s++) {
      const y0 = t + (s * (h - t)) / shelves
      let x = -w / 2 + t + 0.02
      while (x < w / 2 - t - 0.06 && rnd() > 0.08) {
        const bw = 0.02 + rnd() * 0.03
        const bh = 0.18 + rnd() * 0.1
        out.push({ x: x + bw / 2, y: y0 + bh / 2, bw, bh, c: BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)] })
        x += bw + 0.003
        if (rnd() > 0.93) x += 0.12
      }
    }
    return out
  }, [w, h, shelves])
  return (
    <group>
      {[-1, 1].map((s) => <Box key={s} size={[t, h, d]} position={[s * (w / 2 - t / 2), h / 2, 0]}><Wood color={item.color} /></Box>)}
      <Box size={[w, h, 0.01]} position={[0, h / 2, -d / 2 + 0.005]}><Wood color={item.color} /></Box>
      {Array.from({ length: shelves + 1 }, (_, i) => (
        <Box key={i} size={[w - t * 2, t, d]} position={[0, t / 2 + (i * (h - t)) / shelves, 0]}><Wood color={item.color} /></Box>
      ))}
      {books.map((b, i) => (
        <Box key={i} size={[b.bw, b.bh, d * 0.75]} position={[b.x, b.y, 0]}><Fabric color={b.c} /></Box>
      ))}
    </group>
  )
}

function ClothesRack({ item }: P) {
  const { w, d, h } = item.size
  const garments = useMemo(() => {
    const n = Math.max(3, Math.floor((w - 0.15) / 0.075))
    return Array.from({ length: n }, (_, i) => ({
      x: -w / 2 + 0.1 + ((w - 0.2) / (n - 1)) * i,
      len: 0.85 + ((i * 37) % 7) * 0.07,
      c: i % 5 === 3 ? '#f1d3cc' : i % 4 === 1 ? '#f6efe6' : item.accent,
    }))
  }, [w, item.accent])
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <Cyl r={0.013} h={h} position={[s * w / 2, h / 2, 0]}><Metal color={item.color} /></Cyl>
          <mesh position={[s * w / 2, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, d, 12]} />
            <Metal color={item.color} />
          </mesh>
          <mesh position={[s * w / 2, h + 0.03, 0]} castShadow>
            <sphereGeometry args={[0.03, 16, 16]} />
            <Metal color={item.color} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, h - 0.04, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, w, 16]} />
        <Metal color={item.color} />
      </mesh>
      {garments.map((g, i) => (
        <group key={i} position={[g.x, h - 0.08, 0]} rotation={[0, (i % 3) * 0.08 - 0.08, 0]}>
          <mesh position={[0, -g.len / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.07, 0.19, g.len, 20, 1, true]} />
            <meshStandardMaterial color={g.c} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.006, 0.006, 0.36, 8]} />
            <meshStandardMaterial color="#f7f3ee" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function FloorMirror({ item }: P) {
  const { w, d, h } = item.size
  const f = 0.06
  return (
    <group rotation={[-0.08, 0, 0]} position={[0, 0, 0.06]}>
      <Box size={[w, h, d]} position={[0, h / 2, 0]} radius={0.015}><Metal color={item.color} /></Box>
      <group position={[0, h / 2, d / 2 + 0.002]}>
        <Mirror w={w - f * 2} h={h - f * 2} />
      </group>
      {/* Crest */}
      <mesh position={[0, h - 0.01, 0]} castShadow>
        <torusGeometry args={[0.09, 0.02, 12, 32, Math.PI]} />
        <Metal color={item.color} />
      </mesh>
    </group>
  )
}

function Rug({ item }: P) {
  const { w, d, h } = item.size
  return (
    <group>
      <Box size={[w, h, d]} position={[0, h / 2, 0]} radius={Math.min(h / 2, 0.005)}><Fabric color={item.accent} /></Box>
      <Box size={[w - 0.14, h + 0.002, d - 0.14]} position={[0, h / 2 + 0.001, 0]}><Fabric color={item.color} /></Box>
    </group>
  )
}

function FloorLamp({ item }: P) {
  const { w, h } = item.size
  const shadeH = 0.32
  return (
    <group>
      <Cyl r={w * 0.4} r2={w * 0.36} h={0.03} position={[0, 0.015, 0]}><Metal color={item.color} /></Cyl>
      <Cyl r={0.012} h={h - shadeH} position={[0, (h - shadeH) / 2, 0]}><Metal color={item.color} /></Cyl>
      <mesh position={[0, h - shadeH / 2, 0]} castShadow>
        <cylinderGeometry args={[w * 0.32, w / 2, shadeH, 32, 1, true]} />
        <meshStandardMaterial color={item.accent} roughness={0.9} side={THREE.DoubleSide} emissive={item.accent} emissiveIntensity={0.6} transparent opacity={0.93} />
      </mesh>
      <pointLight position={[0, h - shadeH * 0.55, 0]} intensity={2.2} distance={4.5} decay={2} color="#ffd9a8" />
    </group>
  )
}

function Chandelier({ item }: P) {
  const { w, h } = item.size
  const arms = 6
  const ring = w * 0.42
  const armY = h * 0.35
  const drops = useMemo(() => Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2
    const r = ring * (i % 2 ? 0.95 : 0.65)
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: armY - 0.08 - (i % 3) * 0.05 }
  }), [ring, armY])
  return (
    <group>
      <Cyl r={0.012} h={h - armY} position={[0, armY + (h - armY) / 2, 0]}><Metal color={item.color} /></Cyl>
      <Cyl r={0.07} r2={0.05} h={0.02} position={[0, h - 0.01, 0]}><Metal color={item.color} /></Cyl>
      <mesh position={[0, armY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ring, 0.01, 10, 48]} />
        <Metal color={item.color} />
      </mesh>
      <mesh position={[0, armY - 0.04, 0]}>
        <sphereGeometry args={[0.06, 20, 16]} />
        <Metal color={item.color} />
      </mesh>
      {Array.from({ length: arms }, (_, i) => {
        const a = (i / arms) * Math.PI * 2
        const x = Math.cos(a) * ring
        const z = Math.sin(a) * ring
        return (
          <group key={i} position={[x, armY, z]}>
            <Cyl r={0.028} r2={0.035} h={0.03} position={[0, 0.015, 0]}><Metal color={item.color} /></Cyl>
            <Cyl r={0.011} h={0.09} position={[0, 0.075, 0]}><meshStandardMaterial color="#fffaf0" roughness={0.6} /></Cyl>
            <mesh position={[0, 0.135, 0]}>
              <sphereGeometry args={[0.012, 8, 8]} />
              <meshStandardMaterial color="#ffd27a" emissive="#ffc766" emissiveIntensity={4} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
      {drops.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <octahedronGeometry args={[0.025]} />
          <meshPhysicalMaterial color={item.accent} roughness={0.02} metalness={0} transparent opacity={0.6} ior={1.6} userData={{ [TRACE_TRANSMISSION]: 0.9 }} />
        </mesh>
      ))}
      <pointLight position={[0, armY + 0.05, 0]} intensity={4} distance={7} decay={2} color="#ffdcae" />
    </group>
  )
}

function Plant({ item }: P) {
  const { w, h } = item.size
  const potH = Math.min(0.35, h * 0.3)
  const leaves = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const a = i * 2.4
    const t = i / 14
    return { a, y: potH + 0.1 + t * (h - potH - 0.2), r: w * 0.18 + t * w * 0.18, s: 0.12 + (1 - t) * 0.08 }
  }), [w, h, potH])
  return (
    <group>
      <Cyl r={w * 0.28} r2={w * 0.34} h={potH} position={[0, potH / 2, 0]}><meshStandardMaterial color={item.accent} roughness={0.7} /></Cyl>
      <Cyl r={0.012} h={h - potH} position={[0, potH + (h - potH) / 2, 0]}><Wood color="#6d5a3f" /></Cyl>
      {leaves.map((l, i) => (
        <mesh key={i} position={[Math.cos(l.a) * l.r, l.y, Math.sin(l.a) * l.r]} rotation={[0.6, l.a, 0.3]} scale={[1, 0.35, 1.6]} castShadow>
          <sphereGeometry args={[l.s, 10, 8]} />
          <meshStandardMaterial color={item.color} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

/** Pleated sheer panels on a rod, gathered at the bottom like the balloon curtains in period rooms. */
function Curtain({ item }: P) {
  const { w, d, h } = item.size
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, h - 0.06, Math.max(24, Math.round(w * 40)), 24)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const t = 1 - (y + (h - 0.06) / 2) / (h - 0.06) // 0 at top, 1 at bottom
      const pleat = Math.sin((x / w) * Math.PI * w * 12) * 0.025
      // Scallops that swag up between gathers near the hem.
      const swag = Math.pow(Math.max(0, t - 0.7) / 0.3, 2) * (0.5 - 0.5 * Math.cos((x / w + 0.5) * Math.PI * 2 * Math.max(2, Math.round(w / 0.7))))
      pos.setZ(i, pleat * (1 + t * 0.6) + swag * 0.05)
      pos.setY(i, y + swag * 0.18)
    }
    g.computeVertexNormals()
    return g
  }, [w, h])
  return (
    <group>
      <mesh position={[0, h - 0.03, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, w + 0.2, 12]} />
        <Metal />
      </mesh>
      <mesh geometry={geo} position={[0, (h - 0.06) / 2, -d / 2 + 0.06]} castShadow>
        <meshStandardMaterial color={item.accent} roughness={1} side={THREE.DoubleSide} transparent opacity={0.8} />
      </mesh>
      <mesh geometry={geo} position={[0, (h - 0.06) / 2 + 0.02, d / 2 - 0.02]} scale={[1, 0.97, 1.3]} castShadow>
        <meshStandardMaterial color={item.color} roughness={1} side={THREE.DoubleSide} transparent opacity={0.72} />
      </mesh>
    </group>
  )
}

function Frame({ item }: P) {
  const { w, d, h } = item.size
  const b = Math.min(w, h) * 0.12
  return (
    <group>
      <Box size={[w, h, d]} position={[0, h / 2, 0]} radius={0.006}><Metal color={item.color} /></Box>
      <mesh position={[0, h / 2, d / 2 + 0.001]}>
        <planeGeometry args={[w - b * 2, h - b * 2]} />
        <meshStandardMaterial color={item.accent} roughness={0.8} />
      </mesh>
    </group>
  )
}

export function ProceduralModel({ item }: P) {
  switch (item.kind) {
    case 'bed': return <Bed item={item} />
    case 'sofa': return <Sofa item={item} />
    case 'armchair': return <Armchair item={item} />
    case 'diningTable': return <DiningTable item={item} />
    case 'chair': return <Chair item={item} />
    case 'desk': return <Desk item={item} />
    case 'wardrobe': return <Cabinet item={item} rows={1} cols={Math.max(2, Math.round(item.size.w / 0.5))} legs={0.04} />
    case 'dresser': return <Cabinet item={item} rows={3} cols={item.size.w > 0.8 ? 2 : 1} legs={0.12} />
    case 'nightstand': return <Cabinet item={item} rows={2} cols={1} legs={0.12} />
    case 'bookshelf': return <Bookshelf item={item} />
    case 'clothesRack': return <ClothesRack item={item} />
    case 'floorMirror': return <FloorMirror item={item} />
    case 'rug': return <Rug item={item} />
    case 'floorLamp': return <FloorLamp item={item} />
    case 'chandelier': return <Chandelier item={item} />
    case 'plant': return <Plant item={item} />
    case 'curtain': return <Curtain item={item} />
    case 'frame': return <Frame item={item} />
    default: return <PrincessModel item={item} />
  }
}

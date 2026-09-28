import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useProject } from '../store'
import { MAX_PHOTOS, photoCamera, projectionUniforms } from './projectionShader'

const depthMaterial = new THREE.MeshDepthMaterial()

type Pass = { photoId: string; texture: THREE.Texture; target: THREE.WebGLRenderTarget; camera: THREE.PerspectiveCamera }

/** Keeps the projection uniforms in sync with the project's photos and renders each photo camera's depth map. */
export function PhotoProjection({ strength = 1 }: { strength?: number }) {
  const { photos, room } = useProject()
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  const active = useMemo(
    () => photos.filter((p) => p.projected && p.camera).slice(0, MAX_PHOTOS),
    [photos],
  )

  const passes = useMemo<Pass[]>(
    () =>
      active.map((p) => {
        const texture = new THREE.TextureLoader().load(p.dataUrl)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 8
        const aspect = p.width / p.height
        const h = 1024
        const target = new THREE.WebGLRenderTarget(Math.round(h * aspect), h, {
          depthTexture: new THREE.DepthTexture(Math.round(h * aspect), h),
        })
        return { photoId: p.id, texture, target, camera: photoCamera(p.camera!, p) }
      }),
    [active],
  )

  useEffect(
    () => () =>
      passes.forEach((p) => {
        p.texture.dispose()
        p.target.dispose()
      }),
    [passes],
  )

  useEffect(() => {
    projectionUniforms.uPhotoCount.value = passes.length
    passes.forEach((p, i) => {
      projectionUniforms[`uPhotoMap${i}`].value = p.texture
      projectionUniforms[`uPhotoDepth${i}`].value = p.target.depthTexture
      ;(projectionUniforms[`uPhotoViewProj${i}`].value as THREE.Matrix4).multiplyMatrices(
        p.camera.projectionMatrix,
        p.camera.matrixWorldInverse,
      )
      ;(projectionUniforms[`uPhotoPos${i}`].value as THREE.Vector3).copy(p.camera.position)
    })
    return () => {
      projectionUniforms.uPhotoCount.value = 0
    }
  }, [passes])

  useEffect(() => {
    projectionUniforms.uPhotoStrength.value = strength
  }, [strength])

  // The room geometry changes the depth maps, so re-render them whenever it changes.
  const geometryKey = JSON.stringify([room.corners, room.height, room.openings])
  const dirty = useMemo(() => ({ key: '' }), [])
  useFrame(() => {
    const key = geometryKey + passes.map((p) => p.photoId).join()
    if (dirty.key === key || !passes.length) return
    dirty.key = key
    const prevOverride = scene.overrideMaterial
    const prevTarget = gl.getRenderTarget()
    const prevShadow = gl.shadowMap.autoUpdate
    gl.shadowMap.autoUpdate = false
    scene.overrideMaterial = depthMaterial
    for (const p of passes) {
      gl.setRenderTarget(p.target)
      gl.clear()
      gl.render(scene, p.camera)
    }
    scene.overrideMaterial = prevOverride
    gl.setRenderTarget(prevTarget)
    gl.shadowMap.autoUpdate = prevShadow
  })

  return null
}

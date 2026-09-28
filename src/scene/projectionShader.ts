import * as THREE from 'three'
import type { PhotoCamera, RoomPhoto } from '../types'

/**
 * Paints room photos back onto the 3D walls, floor and ceiling ("projective texturing").
 *
 * Each photo has a recovered camera. For every surface point we ask each photo camera: can you see this point,
 * and from how straight on? Visible points take their color from the photo, blended across photos by how
 * frontally each one saw the surface. Visibility uses a depth map rendered from the photo camera, so a wall
 * hidden behind another wall (in L-shaped rooms) does not get painted with the wrong part of the photo.
 */

export const MAX_PHOTOS = 4
export const PHOTO_NEAR = 0.05
export const PHOTO_FAR = 60
/** Layer the room surfaces are on, so depth passes can render just them. */
export const ROOM_LAYER = 1

const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
blank.needsUpdate = true

const depthBlank = new THREE.DepthTexture(1, 1)

export type ProjectionUniforms = {
  uPhotoCount: { value: number }
  uPhotoStrength: { value: number }
  [key: string]: { value: unknown }
}

export const projectionUniforms: ProjectionUniforms = {
  uPhotoCount: { value: 0 },
  uPhotoStrength: { value: 1 },
}
for (let i = 0; i < MAX_PHOTOS; i++) {
  projectionUniforms[`uPhotoMap${i}`] = { value: blank }
  projectionUniforms[`uPhotoDepth${i}`] = { value: depthBlank }
  projectionUniforms[`uPhotoViewProj${i}`] = { value: new THREE.Matrix4() }
  projectionUniforms[`uPhotoPos${i}`] = { value: new THREE.Vector3() }
}

const decls = Array.from(
  { length: MAX_PHOTOS },
  (_, i) => `uniform sampler2D uPhotoMap${i};
uniform sampler2D uPhotoDepth${i};
uniform mat4 uPhotoViewProj${i};
uniform vec3 uPhotoPos${i};`,
).join('\n')

const accumulate = Array.from(
  { length: MAX_PHOTOS },
  (_, i) => `if (uPhotoCount > ${i}) {
    photoAcc += photoSample(uPhotoMap${i}, uPhotoDepth${i}, uPhotoViewProj${i}, uPhotoPos${i}, photoN, photoCover);
  }`,
).join('\n  ')

const fragmentHelpers = `
uniform int uPhotoCount;
float photoViewDistance(float depth) {
  float n = ${PHOTO_NEAR.toFixed(3)};
  float f = ${PHOTO_FAR.toFixed(1)};
  return (n * f) / (f - depth * (f - n));
}
uniform float uPhotoStrength;
${decls}
varying vec3 vPhotoWorld;
varying vec3 vPhotoNormal;

// Returns the photo color premultiplied by its blend weight (weight in .a) and raises \`cover\` to how surely
// this photo saw the point. Weight favors photos that saw the surface head-on; cover only fades at the edges.
vec4 photoSample(sampler2D map, sampler2D depthMap, mat4 viewProj, vec3 camPos, vec3 n, inout float cover) {
  vec4 clip = viewProj * vec4(vPhotoWorld, 1.0);
  if (clip.w <= 0.0) return vec4(0.0);
  vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  vec3 toCam = normalize(camPos - vPhotoWorld);
  float facing = dot(n, toCam);
  if (facing <= 0.02) return vec4(0.0);
  float sceneDist = photoViewDistance(texture2D(depthMap, uv).x);
  if (clip.w > sceneDist + 0.04 + 0.01 * clip.w) return vec4(0.0);
  // Fade out toward the photo's edges so overlapping photos blend without seams.
  vec2 edge = min(uv, 1.0 - uv);
  float alpha = smoothstep(0.0, 0.03, min(edge.x, edge.y)) * smoothstep(0.02, 0.1, facing);
  cover = max(cover, alpha);
  float w = alpha * facing * facing + 1e-4 * alpha;
  return vec4(texture2D(map, uv).rgb * w, w);
}
`

/**
 * Hooks projection into a standard material. The photo already contains the room's real lighting, so it is
 * mostly added as emitted light; a little stays in the diffuse color so furniture still casts visible shadows.
 */
export function withPhotoProjection<T extends THREE.MeshStandardMaterial>(material: T): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, projectionUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPhotoWorld;\nvarying vec3 vPhotoNormal;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vPhotoWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vPhotoNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragmentHelpers}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  vec4 photoAcc = vec4(0.0);
  float photoCover = 0.0;
  vec3 photoN = normalize(vPhotoNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  ${accumulate}
  float photoMix = photoCover * uPhotoStrength;
  vec3 photoColor = photoAcc.a > 0.0 ? photoAcc.rgb / photoAcc.a : vec3(0.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, photoColor * 0.3, photoMix);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += photoColor * photoMix * 0.8;`,
      )
  }
  material.customProgramCacheKey = () => 'photo-projection'
  return material
}

/** A three.js camera matching a solved photo camera. */
export function photoCamera(cam: PhotoCamera, photo: Pick<RoomPhoto, 'width' | 'height'>) {
  const c = new THREE.PerspectiveCamera(cam.fov, photo.width / photo.height, PHOTO_NEAR, PHOTO_FAR)
  c.position.set(...cam.position)
  c.rotation.set(cam.rotation[0], cam.rotation[1], cam.rotation[2], 'YXZ')
  c.updateMatrixWorld(true)
  c.updateProjectionMatrix()
  c.layers.set(ROOM_LAYER)
  return c
}

import { get, set } from 'idb-keyval'

// Uploaded 3D files are kept out of the project JSON: they are large and binary.
const key = (id: string) => `interior-3d-room:model:${id}`
const urls = new Map<string, string>()

export async function saveModel(id: string, data: ArrayBuffer) {
  await set(key(id), data)
}

/** Object URL for a stored model, created once per session. */
export async function modelUrl(id: string): Promise<string | null> {
  const cached = urls.get(id)
  if (cached) return cached
  const data = await get<ArrayBuffer>(key(id))
  if (!data) return null
  const url = URL.createObjectURL(new Blob([data], { type: 'model/gltf-binary' }))
  urls.set(id, url)
  return url
}

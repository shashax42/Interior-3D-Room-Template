import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { aiPhotoPlugin } from './server/aiPhoto.ts'

export default defineConfig({
  // Relative asset paths so the built app also works when served from a sub-path.
  base: './',
  plugins: [react(), aiPhotoPlugin()],
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { aiPhotoPlugin } from './server/aiPhoto'

export default defineConfig({
  plugins: [react(), aiPhotoPlugin()],
})

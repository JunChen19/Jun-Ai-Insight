import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works from a Gitee Pages subpath
  // (https://<user>.gitee.io/ai-insight/) as well as from a domain root.
  base: './',
})

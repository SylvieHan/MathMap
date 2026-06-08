import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: set GITHUB_PAGES=true and VITE_BASE_PATH=/YourRepoName/
// Custom domain or local: base defaults to '/'
const base =
  process.env.VITE_BASE_PATH ??
  (process.env.GITHUB_PAGES === 'true' ? '/MathMap/' : '/')

export default defineConfig({
  plugins: [react()],
  base,
})

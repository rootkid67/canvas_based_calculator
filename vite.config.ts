import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdir, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { defineConfig } from 'vite'

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  }))
  return nested.flat()
}

function offlineAssetWorker() {
  return {
    name: 'calcink-offline-asset-worker',
    apply: 'build' as const,
    async closeBundle() {
      const outputDirectory = join(process.cwd(), 'dist')
      const files = await listFiles(outputDirectory)
      const assets = files
        .filter((file) => relative(outputDirectory, file) !== 'service-worker.js')
        .map((file) => relative(outputDirectory, file).split(sep).join('/'))
        .sort()
      const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12)
      const source = `const CACHE_NAME = 'calcink-${version}'
const ASSETS = ${JSON.stringify(assets)}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS.map((asset) => new URL(asset, self.registration.scope).href))).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('calcink-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
    return response
  }).catch(() => request.mode === 'navigate' ? caches.match(new URL('index.html', self.registration.scope)) : Response.error())))
})
`
      await writeFile(join(outputDirectory, 'service-worker.js'), source, 'utf8')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineAssetWorker()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})

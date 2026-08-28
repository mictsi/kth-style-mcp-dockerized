#!/usr/bin/env node

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from './index.js'

const DEFAULT_PORT = 8888
const DEFAULT_HOST = '0.0.0.0'
const MCP_ROUTE = '/mcp'
const HEALTH_ROUTE = '/healthz'
const SAMPLE_ROUTE = '/sample-site'

// dist/http.js sits one level below the application root, where the landing
// page and the sample site live in both the image and a source checkout.
const APP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const LANDING_PAGE = path.join(APP_ROOT, 'index.html')
const SAMPLE_SITE_DIR = path.join(APP_ROOT, 'sample-site')
const SHUTDOWN_GRACE_MS = 10_000

/** Path segments we are willing to mount the app under. */
const BASE_PATH_PATTERN = /^\/[A-Za-z0-9\-._~/]*$/

function readPort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value "${value}". Expected an integer from 1 to 65535.`)
  }

  return parsed
}

/**
 * Normalises a mount path to either '' (root) or '/some/prefix' without a
 * trailing slash, so every route can be composed as `${basePath}${route}`.
 */
function normalizeBasePath(value: string | undefined): string {
  const raw = (value ?? '').trim()
  if (!raw || raw === '/') {
    return ''
  }

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`
  const normalized = withLeadingSlash.replace(/\/+$/, '').replace(/\/{2,}/g, '/')
  if (!normalized) {
    return ''
  }

  if (!BASE_PATH_PATTERN.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid BASE_PATH value "${raw}". Expected a path such as /kth-style-mcp.`)
  }

  return normalized
}

interface PublicConfig {
  basePath: string
  publicUrl: string | null
  publicOrigin: string | null
  publicHost: string | null
}

/**
 * PUBLIC_URL is the full URL the app is published under, e.g.
 * https://example.kth.se/kth-style-mcp. Its path becomes the mount point
 * unless BASE_PATH overrides it, and its host seeds DNS rebinding protection.
 */
function readPublicConfig(): PublicConfig {
  const publicUrlRaw = process.env.PUBLIC_URL?.trim()
  let basePathSource = process.env.BASE_PATH?.trim()
  let publicOrigin: string | null = null
  let publicHost: string | null = null

  if (publicUrlRaw) {
    let parsed: URL
    try {
      parsed = new URL(publicUrlRaw)
    } catch {
      throw new Error(`Invalid PUBLIC_URL value "${publicUrlRaw}". Expected an absolute URL such as https://example.kth.se/kth-style-mcp.`)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid PUBLIC_URL protocol "${parsed.protocol}". Expected http or https.`)
    }
    publicOrigin = parsed.origin
    // hostname (no port): DNS rebinding validation compares hostnames only.
    publicHost = parsed.hostname
    if (!basePathSource) {
      basePathSource = parsed.pathname
    }
  }

  const basePath = normalizeBasePath(basePathSource)
  const publicUrl = publicOrigin ? `${publicOrigin}${basePath}` : null

  return { basePath, publicUrl, publicOrigin, publicHost }
}

/** Loopback names are always allowed so the container health check can reach the app. */
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]']

/**
 * Builds the DNS rebinding allowlist. Entries are hostnames without ports,
 * because the SDK compares `new URL('http://' + hostHeader).hostname`.
 */
function readAllowedHosts(publicHost: string | null): string[] | undefined {
  const configured = (process.env.ALLOWED_HOSTS ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      try {
        return new URL(`http://${entry}`).hostname
      } catch {
        throw new Error(`Invalid ALLOWED_HOSTS entry "${entry}". Expected a hostname such as example.kth.se.`)
      }
    })

  const hosts = new Set(configured)
  if (publicHost) {
    hosts.add(publicHost)
  }

  if (hosts.size === 0) {
    return undefined
  }

  for (const loopback of LOOPBACK_HOSTS) {
    hosts.add(loopback)
  }

  return [...hosts]
}

/**
 * The landing page and sample site are served from the same mount point as the
 * MCP endpoint, so a deployment publishes one URL. Set SERVE_SITE=false to run
 * the protocol endpoint alone.
 */
function readServeSite(): boolean {
  const value = process.env.SERVE_SITE?.trim().toLowerCase()
  if (value === 'false' || value === '0' || value === 'off') {
    return false
  }
  return existsSync(LANDING_PAGE) || existsSync(SAMPLE_SITE_DIR)
}

function readTrustProxy(): boolean | number | string {
  const value = process.env.TRUST_PROXY?.trim()
  if (!value || value === 'false' || value === '0') {
    return false
  }
  if (value === 'true') {
    return true
  }
  const hops = Number.parseInt(value, 10)
  return Number.isInteger(hops) && hops >= 0 ? hops : value
}

function baseSecurityHeaders(res: Response): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
}

/** JSON endpoints load nothing and must never be cached. */
function apiSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  baseSecurityHeaders(res)
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  res.setHeader('Cache-Control', 'no-store')
  next()
}

/**
 * The landing page and sample site are documents, so they need a policy that
 * permits their own assets: an inline <style> block on the landing page and the
 * Figtree webfont from Google Fonts. Everything else stays denied.
 */
function siteSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  baseSecurityHeaders(res)
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      "script-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; ')
  )
  next()
}

function methodNotAllowed(message: string) {
  return (_req: Request, res: Response): void => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message },
      id: null,
    })
  }
}

async function main(): Promise<void> {
  const port = readPort(process.env.PORT)
  const host = process.env.HOST || DEFAULT_HOST
  const { basePath, publicUrl, publicHost } = readPublicConfig()
  const allowedHosts = readAllowedHosts(publicHost)

  const app = createMcpExpressApp({ host, allowedHosts })
  app.disable('x-powered-by')
  app.set('trust proxy', readTrustProxy())

  const router = express.Router()

  const serveSite = readServeSite()

  router.get(HEALTH_ROUTE, apiSecurityHeaders, (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'kth-style-mcp',
      transport: 'streamable-http',
      basePath: basePath || '/',
      mcpPath: `${basePath}${MCP_ROUTE}`,
      landingPage: serveSite ? `${basePath}/` : null,
      sampleSite: serveSite ? `${basePath}${SAMPLE_ROUTE}/` : null,
      publicUrl: publicUrl ? `${publicUrl}${MCP_ROUTE}` : null,
    })
  })

  router.post(MCP_ROUTE, apiSecurityHeaders, async (req: Request, res: Response) => {
    const server = createServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

    res.on('close', () => {
      void transport.close().catch((error: unknown) => console.error('Failed to close MCP transport:', error))
      void server.close().catch((error: unknown) => console.error('Failed to close MCP server:', error))
    })

    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      console.error('Failed to handle MCP request:', error)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        })
      }
    }
  })

  router.get(MCP_ROUTE, apiSecurityHeaders, methodNotAllowed('Method not allowed. Use POST for stateless Streamable HTTP.'))
  router.delete(MCP_ROUTE, apiSecurityHeaders, methodNotAllowed('Method not allowed in stateless mode.'))

  // Only these two paths are exposed; the rest of the application directory
  // (node_modules, dist, package.json) is never served.
  if (serveSite) {
    if (existsSync(LANDING_PAGE)) {
      const sendLanding = (_req: Request, res: Response) => res.sendFile(LANDING_PAGE)
      router.get('/', siteSecurityHeaders, sendLanding)
      router.get('/index.html', siteSecurityHeaders, sendLanding)
    }

    if (existsSync(SAMPLE_SITE_DIR)) {
      router.use(
        SAMPLE_ROUTE,
        siteSecurityHeaders,
        express.static(SAMPLE_SITE_DIR, {
          index: 'index.html',
          dotfiles: 'deny',
          redirect: true,
        })
      )
    }
  }

  // Without the trailing slash the browser resolves the page's relative links
  // against the parent path, so the bare mount point redirects rather than
  // serving the landing page directly.
  if (basePath && serveSite) {
    app.get(basePath, (req: Request, res: Response, next: NextFunction) => {
      if (req.originalUrl.split('?')[0] === basePath) {
        res.redirect(301, `${basePath}/`)
        return
      }
      next()
    })
  }

  app.use(basePath || '/', router)

  app.use(apiSecurityHeaders, (_req: Request, res: Response) => {
    res.status(404).json({
      jsonrpc: '2.0',
      error: { code: -32601, message: `Not found. This server is published under "${basePath || '/'}".` },
      id: null,
    })
  })

  const httpServer = app.listen(port, host, () => {
    console.log(`kth-style-mcp listening on http://${host}:${port}${basePath}${MCP_ROUTE}`)
    if (serveSite) {
      console.log(`kth-style-mcp landing page on http://${host}:${port}${basePath}/`)
      console.log(`kth-style-mcp sample site on http://${host}:${port}${basePath}${SAMPLE_ROUTE}/`)
    }
    if (publicUrl) {
      console.log(`kth-style-mcp published at ${publicUrl}${MCP_ROUTE}`)
    }
  })

  // Bound so a stalled or slow-loris client cannot pin a connection open.
  httpServer.headersTimeout = 20_000
  httpServer.requestTimeout = 60_000
  httpServer.keepAliveTimeout = 15_000

  let shuttingDown = false
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    console.log(`Received ${signal}; shutting down kth-style-mcp`)

    const forced = setTimeout(() => {
      console.error('Graceful shutdown timed out; forcing close')
      httpServer.closeAllConnections()
      process.exit(1)
    }, SHUTDOWN_GRACE_MS)
    forced.unref()

    httpServer.close((error?: Error) => {
      clearTimeout(forced)
      if (error) {
        console.error('HTTP shutdown failed:', error)
        process.exit(1)
      }
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error: unknown) => {
  console.error('kth-style-mcp HTTP server failed to start:', error)
  process.exit(1)
})

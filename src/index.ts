#!/usr/bin/env node

import { pathToFileURL } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod/v4'

import {
  buildCatalog,
  getIcon,
  getPackageInfo,
  getTheme,
  getToken,
  listTokens,
  listComponents,
  PackageNotFoundError,
  ParserError,
  resolveSourceDir,
  searchIcons,
  searchMixins,
  searchStyles,
  searchTokens,
  type Catalog,
} from './catalog.js'
import { getComponentGuidance, getHeaderRecipe, getPageScaffold, suggestThemeStructure } from './guidance.js'

let catalogPromise: Promise<Catalog> | null = null

async function loadCatalog(forceRefresh = false): Promise<Catalog> {
  if (!catalogPromise || forceRefresh) {
    catalogPromise = buildCatalog()
  }
  try {
    return await catalogPromise
  } catch (error) {
    // Never cache a rejected catalog: a corrected environment must be retried.
    catalogPromise = null
    throw error
  }
}

interface CatalogDiagnosticResult {
  [key: string]: unknown
  error: {
    kind: 'package-not-found' | 'parser-error' | 'load-error'
    message: string
  }
  diagnostics: string[]
}

type SafeCatalog = { ok: true; catalog: Catalog } | { ok: false; result: CatalogDiagnosticResult }

async function loadCatalogSafe(): Promise<SafeCatalog> {
  try {
    return { ok: true, catalog: await loadCatalog() }
  } catch (error) {
    const kind =
      error instanceof PackageNotFoundError
        ? 'package-not-found'
        : error instanceof ParserError
          ? 'parser-error'
          : 'load-error'
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      result: {
        error: { kind, message },
        diagnostics: [
          `The installed @kth/style package could not be loaded (${kind}). No KTH Style values were returned. Do not approximate or invent values.`,
          message,
          `Searched from KTH_STYLE_SOURCE_DIR or node_modules/@kth/style relative to ${resolveSourceDir()}.`,
        ],
      },
    }
  }
}

function diagnosticResponse(result: CatalogDiagnosticResult) {
  return {
    content: [{ type: 'text' as const, text: asText(result) }],
    structuredContent: result,
    isError: true,
  }
}

function asText(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

const AUTHORITATIVE_DESCRIPTION =
  'This tool returns authoritative KTH Style values from the installed `@kth/style` package. Do not approximate, infer, or invent theme values. If exact values cannot be resolved, return an explicit unresolved result with diagnostics.'

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'kth-style-mcp',
    version: '1.0.0',
    description:
      'Authoritative MCP server for KTH Style values from the installed `@kth/style` package. Clients must use these tools for exact KTH theme, token, asset, component, color, typography, and spacing data instead of approximating or inventing values.',
  })

  server.registerTool(
    'kth_style_get_package_info',
    {
      description: `${AUTHORITATIVE_DESCRIPTION} Return installed package version, package path, asset root, and available Sass/CSS/token/asset files.`,
    },
    async () => {
      const loaded = await loadCatalogSafe()
      if (!loaded.ok) {
        return diagnosticResponse(loaded.result)
      }
      const result = { ...getPackageInfo(loaded.catalog) }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'kth_style_list_tokens',
    {
      description: `${AUTHORITATIVE_DESCRIPTION} List exact reference Sass tokens and semantic CSS custom-property tokens separately, with raw values, resolved values where possible, source files, line numbers, and unresolved diagnostics.`,
      inputSchema: {
        tokenType: z.enum(['reference', 'semantic', 'all']).optional().describe('Token family to return. Reference tokens are Sass variables; semantic tokens are CSS custom properties from theme mixins.'),
        category: z.enum(['all', 'color', 'font', 'space', 'layout', 'colors', 'typography', 'spacing', 'themes']).optional().describe('Optional token category filter. color maps to colors, font maps to typography, space/layout map to spacing.'),
      },
    },
    async ({ tokenType, category }) => {
      const loaded = await loadCatalogSafe()
      if (!loaded.ok) {
        return diagnosticResponse(loaded.result)
      }
      const catalog = loaded.catalog
      const tokens = listTokens(catalog, { tokenType, category })
      const result = {
        package: {
          name: catalog.packageInfo.name,
          version: catalog.packageInfo.version,
          path: catalog.packageInfo.packagePath,
          source: catalog.packageInfo.source,
        },
        count: tokens.length,
        tokens,
        diagnostics: catalog.packageInfo.diagnostics,
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'kth_style_get_token',
    {
      description: `${AUTHORITATIVE_DESCRIPTION} Get one exact token by name, such as $color-blue-kth or --color-primary. Use context for semantic tokens when a theme-specific value is required.`,
      inputSchema: {
        name: z.string().describe('Exact token name, for example $color-blue-kth, color-blue-kth, --color-primary, or theme-default.color-primary.'),
        context: z.string().optional().describe('Optional KTH Style context/theme name such as default, intranet, student-web, external, inverse, or dense. external resolves to the package-backed inverse context. Unsupported contexts return explicit unresolved diagnostics.'),
      },
    },
    async ({ name, context }) => {
      const loaded = await loadCatalogSafe()
      if (!loaded.ok) {
        return diagnosticResponse(loaded.result)
      }
      const catalog = loaded.catalog
      const token = getToken(catalog, name, context)
      const result = {
        package: {
          name: catalog.packageInfo.name,
          version: catalog.packageInfo.version,
          path: catalog.packageInfo.packagePath,
          source: catalog.packageInfo.source,
        },
        query: { name, context: context ?? null },
        token,
        diagnostics: token
          ? catalog.packageInfo.diagnostics
          : [...catalog.packageInfo.diagnostics, `Token "${name}"${context ? ` in context "${context}"` : ''} could not be resolved from the installed @kth/style package.`],
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'kth_style_get_theme',
    {
      description: `${AUTHORITATIVE_DESCRIPTION} Use this tool whenever the user asks for the KTH theme, KTH colors, KTH typography, KTH spacing, KTH assets, or a KTH Style context/theme. The response must be package-backed and must not be an approximation.`,
      inputSchema: {
        context: z.string().optional().describe('KTH Style context/theme to resolve, for example default, intranet, external, student-web, inverse, dark, or dense. external resolves to the package-backed inverse context with diagnostics. Unsupported contexts return warnings and no invented values.'),
        includeReferenceTokens: z.boolean().optional().describe('Include exact Sass reference tokens such as $color-blue-kth. Defaults to true.'),
        includeSemanticTokens: z.boolean().optional().describe('Include exact CSS custom-property semantic tokens for the requested context. Defaults to true.'),
        includeAssets: z.boolean().optional().describe('Include package-backed asset paths such as fonts.css and logotypes. Defaults to true.'),
      },
    },
    async ({ context, includeReferenceTokens, includeSemanticTokens, includeAssets }) => {
      const loaded = await loadCatalogSafe()
      if (!loaded.ok) {
        return diagnosticResponse(loaded.result)
      }
      const result = { ...getTheme(loaded.catalog, { context, includeReferenceTokens, includeSemanticTokens, includeAssets }) }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'kth_style_list_components',
    {
      description: `${AUTHORITATIVE_DESCRIPTION} Return available @kth/style component Sass import paths and related package component files exactly as found in the installed package.`,
      inputSchema: {
        kind: z
          .enum(['all', 'style-component', 'style-script', 'ui-component', 'token', 'util'])
          .optional()
          .describe('Component group to list.'),
        query: z.string().optional().describe('Optional substring to match component names or package paths.'),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum number of components to return.'),
      },
    },
    async ({ kind, query, limit }) => {
      const loaded = await loadCatalogSafe()
      if (!loaded.ok) {
        return diagnosticResponse(loaded.result)
      }
      const catalog = loaded.catalog
      const matches = listComponents(catalog, { kind, query, limit })
      const result = {
        package: {
          name: catalog.packageInfo.name,
          version: catalog.packageInfo.version,
          path: catalog.packageInfo.packagePath,
          source: catalog.packageInfo.source,
        },
        count: matches.length,
        components: matches,
        diagnostics: catalog.packageInfo.diagnostics,
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'suggest_theme_structure',
    {
      description: 'Recommend the right @kth/style entrypoints, theme tokens, scripts, and components for a public, intranet, student-web, or external KTH app.',
      inputSchema: {
        appType: z.enum(['public', 'intranet', 'student-web', 'external']).optional().describe('High-level KTH app shape to target.'),
      },
    },
    async ({ appType }) => {
      const catalog = await loadCatalog()
      const result = {
        sourceDir: catalog.sourceDir,
        suggestion: suggestThemeStructure(catalog, appType),
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'get_header_recipe',
    {
      description: 'Explain how to wire the @kth/style header and navigation structure, including dialog hooks, legacy local-navigation IDs, and theme variant classes.',
      inputSchema: {
        variant: z.enum(['public', 'intranet', 'student-web', 'external']).optional().describe('Header theme variant to target.'),
      },
    },
    async ({ variant }) => {
      const catalog = await loadCatalog()
      const result = {
        sourceDir: catalog.sourceDir,
        recipe: getHeaderRecipe(catalog, variant),
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'get_page_scaffold',
    {
      description: 'Recommend a deterministic page scaffold for the @kth/style public, intranet, student-web, or external theme variants.',
      inputSchema: {
        pageType: z.enum(['public', 'intranet', 'student-web', 'external']).optional().describe('Page shape to scaffold.'),
      },
    },
    async ({ pageType }) => {
      const catalog = await loadCatalog()
      const result = {
        sourceDir: catalog.sourceDir,
        scaffold: getPageScaffold(catalog, pageType),
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'get_component_guidance',
    {
      description: 'Return KTH Style guidance for a specific component area such as header, footer, navigation, button, input, alert, accordion, or translation-panel.',
      inputSchema: {
        component: z
          .enum(['header', 'footer', 'navigation', 'search', 'button', 'input', 'table', 'alert', 'accordion', 'translation-panel', 'local-navigation', 'modal'])
          .describe('Theme area to inspect.'),
        variant: z.enum(['public', 'intranet', 'student-web', 'external']).optional().describe('Theme variant when the component supports it.'),
      },
    },
    async ({ component, variant }) => {
      const catalog = await loadCatalog()
      const result = {
        sourceDir: catalog.sourceDir,
        guidance: getComponentGuidance(catalog, component, variant),
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'search_tokens',
    {
      description: `${AUTHORITATIVE_DESCRIPTION} Search @kth/style tokens, including primitive color/spacing/typography tokens and parsed theme CSS-variable assignments.`,
      inputSchema: {
        query: z.string().optional().describe('Substring to match against token names, values, comments, or file paths.'),
        category: z
          .enum(['all', 'colors', 'typography', 'spacing', 'themes', 'fonts', 'sizes', 'spacings', 'semantic'])
          .optional()
          .describe('Token category. fonts→typography, sizes/spacings→spacing, semantic→themes.'),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum number of matches to return.'),
      },
    },
    async ({ query, category, limit }) => {
      const catalog = await loadCatalog()
      const matches = searchTokens(catalog, { query, category, limit })
      const result = {
        sourceDir: catalog.sourceDir,
        count: matches.length,
        tokens: matches,
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'get_token',
    {
      description: `${AUTHORITATIVE_DESCRIPTION} Get one @kth/style token by exact name, including theme tokens like theme-default.color-primary.`,
      inputSchema: {
        name: z.string().describe('Token name with or without leading $, for example color-blue-kth or theme-default.color-primary.'),
        context: z.string().optional().describe('Optional context for CSS semantic tokens such as default, intranet, student-web, external, inverse, or dense. external resolves to the package-backed inverse context.'),
      },
    },
    async ({ name, context }) => {
      const catalog = await loadCatalog()
      const token = getToken(catalog, name, context)
      const result = {
        package: {
          name: catalog.packageInfo.name,
          version: catalog.packageInfo.version,
          path: catalog.packageInfo.packagePath,
        },
        sourceDir: catalog.sourceDir,
        query: { name, context: context ?? null },
        token,
        diagnostics: token ? catalog.packageInfo.diagnostics : [`Token not found in installed @kth/style package: ${name}`],
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'search_mixins',
    {
      description: 'Search Sass mixins in @kth/style, including typography, theme, and icon helpers.',
      inputSchema: {
        query: z.string().optional().describe('Substring to match mixin names, signatures, comments, or file paths.'),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum number of mixins to return.'),
      },
    },
    async ({ query, limit }) => {
      const catalog = await loadCatalog()
      const matches = searchMixins(catalog, query, limit)
      const result = {
        sourceDir: catalog.sourceDir,
        count: matches.length,
        mixins: matches,
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'list_components',
    {
      description: `${AUTHORITATIVE_DESCRIPTION} List @kth/style SCSS components/utilities/tokens and @kth/style/@kth/ui-components source components.`,
      inputSchema: {
        kind: z
          .enum(['all', 'style-component', 'style-script', 'ui-component', 'token', 'util'])
          .optional()
          .describe('Component group to list.'),
        query: z.string().optional().describe('Optional substring to match component names or paths.'),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum number of components to return.'),
      },
    },
    async ({ kind, query, limit }) => {
      const catalog = await loadCatalog()
      const matches = listComponents(catalog, { kind, query, limit })
      const result = {
        sourceDir: catalog.sourceDir,
        count: matches.length,
        components: matches,
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'search_icons',
    {
      description: 'Search KTH Style icons and logotypes by logical icon name, SCSS icon mixin, or SVG path. Icons are colorless by design and styled via currentColor/mask-image.',
      inputSchema: {
        query: z.string().optional().describe('Substring to match icon names, mixins, data-URI variables, or paths.'),
        color: z.string().optional().describe('Legacy parameter; only "default" matches in the new @kth/style icon model.'),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum number of grouped matches to return.'),
      },
    },
    async ({ query, color, limit }) => {
      const catalog = await loadCatalog()
      const matches = searchIcons(catalog, { query, color, limit })
      const result = {
        sourceDir: catalog.sourceDir,
        count: matches.length,
        icons: matches,
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'get_icon',
    {
      description: 'Get one KTH Style icon or logotype, including SVG content when available, the backing data-URI Sass variable, and the SCSS icon mixin name.',
      inputSchema: {
        name: z.string().describe('Logical icon name such as menu, close, arrow-back, search, or logotype-blue.'),
        color: z.string().optional().describe('Legacy parameter; only "default" matches in the new @kth/style icon model.'),
      },
    },
    async ({ name, color }) => {
      const catalog = await loadCatalog()
      const icon = getIcon(catalog, name, color)
      if (!icon) {
        throw new Error(`Icon not found: ${name}${color ? ` (${color})` : ''}`)
      }
      const result = {
        sourceDir: catalog.sourceDir,
        icon,
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'search_styles',
    {
      description: 'Line-based search across authored @kth/style SCSS, TypeScript source, and @kth/ui-components React source.',
      inputSchema: {
        query: z.string().describe('Substring to search for in authored Sass and TypeScript/TSX sources.'),
        kind: z
          .enum(['all', 'scss', 'js', 'style-component', 'style-script', 'ui-component', 'token', 'util'])
          .optional()
          .describe('Filter the search to a specific file group. js is an alias for style-script + ui-component. scss is an alias for style-component + token + util.'),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum number of matching lines to return.'),
      },
    },
    async ({ query, kind, limit }) => {
      const catalog = await loadCatalog()
      const matches = searchStyles(catalog, { query, kind, limit })
      const result = {
        sourceDir: catalog.sourceDir,
        count: matches.length,
        matches,
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'get_entrypoints',
    {
      description: 'Show the main @kth/style SCSS/CSS/TypeScript entrypoints agents usually need first.',
    },
    async () => {
      const catalog = await loadCatalog()
      const result = {
        sourceDir: catalog.sourceDir,
        entrypoints: catalog.entrypoints,
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  server.registerTool(
    'refresh_catalog',
    {
      description: 'Rebuild the in-memory @kth/style/@kth/ui-components index after source changes.',
    },
    async () => {
      const catalog = await loadCatalog(true)
      const result = {
        sourceDir: catalog.sourceDir,
        stylePackageDir: catalog.stylePackageDir,
        uiComponentsDir: catalog.uiComponentsDir,
        generatedAt: catalog.generatedAt,
        tokenCount: catalog.tokens.length,
        mixinCount: catalog.mixins.length,
        iconCount: catalog.icons.length,
        componentCount: catalog.components.length,
      }
      return {
        content: [{ type: 'text', text: asText(result) }],
        structuredContent: result,
      }
    }
  )

  return server
}

async function main(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error('kth-style-mcp failed to start:', error)
    process.exit(1)
  })
}

import { existsSync, promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export type TokenCategory = 'colors' | 'typography' | 'spacing' | 'themes'
export type TokenType = 'reference' | 'semantic'
export type DiscoverySource = 'explicit' | 'source-dir' | 'installed' | 'monorepo-default'
export type ComponentKind = 'style-component' | 'style-script' | 'ui-component' | 'token' | 'util'
export type SearchKind = ComponentKind | 'scss' | 'js' | 'all'

export interface Token {
  name: string
  tokenType: TokenType
  category: TokenCategory
  filePath: string
  lineNumber: number
  rawValue: string
  resolvedValue: string | null
  comment: string | null
  context: string | null
  cssName: string | null
  dependencyChain: string[]
  unresolved: string | null
}

export interface Mixin {
  name: string
  parameters: string | null
  signature: string
  filePath: string
  description: string | null
}

export interface IconVariant {
  variant: 'default'
  filePath: string | null
  relativePath: string | null
  svg: string | null
  dataUriVariable: string | null
  scssMixin: string | null
}

export interface IconGroup {
  name: string
  kind: 'icon' | 'logotype'
  variants: IconVariant[]
}

export interface Component {
  name: string
  kind: ComponentKind
  filePath: string
  relativePath: string
  importPath: string | null
}

export interface SearchableFile {
  filePath: string
  relativePath: string
  kind: ComponentKind
  content: string
}

export interface EntryPoint {
  name: string
  type: 'sass' | 'css' | 'js'
  relativePath: string
  description: string
}

export interface PackageInfo {
  name: '@kth/style'
  version: string | null
  packagePath: string
  assetRoot: string
  source: DiscoverySource
  availableFiles: {
    sass: string[]
    css: string[]
    tokens: string[]
    assets: string[]
  }
  diagnostics: string[]
}

export interface ThemeToken {
  rawValue: string
  resolvedValue: string | null
  category: TokenCategory
  context: string | null
  cssName: string | null
  source: {
    file: string
    line: number
  }
  dependencies: string[]
  unresolved: string | null
}

export interface ThemeResult {
  package: {
    name: '@kth/style'
    version: string | null
    packagePath: string
    assetsPath: string
    source: DiscoverySource
  }
  request: {
    context: string
    includeReferenceTokens: boolean
    includeSemanticTokens: boolean
    includeAssets: boolean
  }
  context: string
  availableContexts: string[]
  tokens: {
    reference: Record<string, ThemeToken>
    semantic: Record<string, ThemeToken>
  }
  assets: {
    fontsCss: string | null
    assetRoot: string
    availableFiles: string[]
    logotypes: Array<{ name: string; filePath: string | null; relativePath: string | null }>
  }
  scss: {
    recommendedImports: string[]
  }
  diagnostics: string[]
  /** @deprecated Use `diagnostics`. Retained as an alias for backward compatibility. */
  warnings: string[]
}

export interface Catalog {
  sourceDir: string
  stylePackageDir: string
  uiComponentsDir: string | null
  packageInfo: PackageInfo
  generatedAt: string
  tokens: Token[]
  tokenMap: Map<string, Token>
  mixins: Mixin[]
  icons: IconGroup[]
  components: Component[]
  searchableFiles: SearchableFile[]
  entrypoints: EntryPoint[]
}

interface SourceLayout {
  sourceDir: string
  stylePackageDir: string
  uiComponentsDir: string | null
}

interface ParseState {
  braceDepth: number
  pendingComments: string[]
}

interface IconMixinReference {
  logicalName: string
  mixinName: string
  rawVariableName: string
  sourceIconName: string
}

const TOP_LEVEL_VARIABLE_PATTERN = /^\s*\$([\w-]+)\s*:\s*(.+?)\s*(?:!default)?\s*;\s*(?:\/\/\s*(.*))?$/
const MIXIN_PATTERN = /^\s*@mixin\s+([\w-]+)(?:\((.*?)\))?\s*\{/
const THEME_VARIABLE_PATTERN = /^\s*--([\w-]+)\s*:\s*(.+?)\s*;\s*(?:\/\/\s*(.*))?$/
const RAW_ICON_REFERENCE_PATTERN = /raw\.\$(icon-[\w-]+)/
const EXTENSION_PATTERN = /\.(scss|css|ts|tsx)$/
const CONTEXT_ALIASES = new Map([
  ['external', 'inverse'],
  ['external-web', 'inverse'],
])

export interface DiscoveryResult {
  dir: string
  source: DiscoverySource
}

export class PackageNotFoundError extends Error {
  readonly kind = 'package-not-found'
  constructor(message: string) {
    super(message)
    this.name = 'PackageNotFoundError'
  }
}

export class ParserError extends Error {
  readonly kind = 'parser-error'
  constructor(message: string) {
    super(message)
    this.name = 'ParserError'
  }
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

function findInstalledStylePackage(): string | null {
  if (process.env.KTH_STYLE_DISABLE_INSTALLED_DISCOVERY === '1') {
    return null
  }

  const bases = [process.cwd(), MODULE_DIR]
  for (const base of bases) {
    let dir = path.resolve(base)
    while (true) {
      const candidate = path.join(dir, 'node_modules', '@kth', 'style')
      if (existsSync(path.join(candidate, 'package.json')) && existsSync(path.join(candidate, 'scss'))) {
        return candidate
      }
      const parent = path.dirname(dir)
      if (parent === dir) {
        break
      }
      dir = parent
    }
  }
  return null
}

export function discoverStyleSource(explicitDir?: string): DiscoveryResult {
  if (explicitDir) {
    return { dir: path.resolve(explicitDir), source: 'explicit' }
  }
  if (process.env.KTH_STYLE_SOURCE_DIR) {
    return { dir: path.resolve(process.env.KTH_STYLE_SOURCE_DIR), source: 'source-dir' }
  }
  const installed = findInstalledStylePackage()
  if (installed) {
    return { dir: installed, source: 'installed' }
  }
  return { dir: path.resolve(path.join(process.cwd(), '..', 'style')), source: 'monorepo-default' }
}

export function resolveSourceDir(explicitDir?: string): string {
  return discoverStyleSource(explicitDir).dir
}

export async function buildCatalog(explicitDir?: string): Promise<Catalog> {
  const discovery = discoverStyleSource(explicitDir)
  const layout = await resolveSourceLayout(discovery.dir)

  const tokenFiles = [
    ['colors', path.join(layout.stylePackageDir, 'scss/tokens/colors.scss')],
    ['typography', path.join(layout.stylePackageDir, 'scss/tokens/typography.scss')],
    ['spacing', path.join(layout.stylePackageDir, 'scss/tokens/spacing.scss')],
  ] as const

  const allStyleScssFiles = (await walk(path.join(layout.stylePackageDir, 'scss')))
    .filter((filePath) => filePath.endsWith('.scss'))
    .filter((filePath) => !filePath.endsWith('icons-raw.scss'))
    .sort()

  const styleSourceFiles = (await walk(path.join(layout.stylePackageDir, 'src')))
    .filter((filePath) => /\.(ts|tsx)$/.test(filePath))
    .sort()

  const uiSourceFiles = layout.uiComponentsDir
    ? (await walk(path.join(layout.uiComponentsDir, 'src'))).filter((filePath) => /\.(ts|tsx)$/.test(filePath)).sort()
    : []

  const svgFiles = (
    await Promise.all([
      walk(path.join(layout.stylePackageDir, 'icons')),
      walk(path.join(layout.stylePackageDir, 'assets/logotype')),
    ])
  )
    .flat()
    .filter((filePath) => filePath.endsWith('.svg'))
    .sort()

  const [tokenFileContents, scssContents, styleSourceContents, uiSourceContents, svgContents, iconsScssContent, iconsRawContent] =
    await Promise.all([
      Promise.all(tokenFiles.map(([, filePath]) => readUtf8(filePath))),
      Promise.all(allStyleScssFiles.map((filePath) => readUtf8(filePath))),
      Promise.all(styleSourceFiles.map((filePath) => readUtf8(filePath))),
      Promise.all(uiSourceFiles.map((filePath) => readUtf8(filePath))),
      Promise.all(svgFiles.map((filePath) => readUtf8(filePath))),
      readUtf8(path.join(layout.stylePackageDir, 'scss/tokens/icons.scss')),
      readUtf8(path.join(layout.stylePackageDir, 'scss/tokens/icons-raw.scss')),
    ])

  const packageInfo = await buildPackageInfo(layout, allStyleScssFiles, svgFiles, discovery.source)

  const primitiveTokens = tokenFiles.flatMap(([category, filePath], index) =>
    parseTopLevelVariables(filePath, tokenFileContents[index], category)
  )
  const primitiveTokenMap = new Map(primitiveTokens.map((token) => [normalizeName(token.name), token]))

  const resolvedPrimitiveTokens = primitiveTokens.map((token) => ({
    ...token,
    ...resolveTokenValueWithChain(token.rawValue, primitiveTokenMap),
  }))

  const themeTokens = [
    ...parseThemeTokens(tokenFiles[0][1], tokenFileContents[0], primitiveTokenMap),
    ...parseThemeTokens(tokenFiles[2][1], tokenFileContents[2], primitiveTokenMap),
  ]

  const tokens = [...resolvedPrimitiveTokens, ...themeTokens]
  const tokenMap = new Map(tokens.map((token) => [normalizeName(token.name), token]))
  const mixins = allStyleScssFiles.flatMap((filePath, index) => parseMixins(filePath, scssContents[index]))

  const rawIconVariableMap = parseRawIconVariables(iconsRawContent)
  const iconMixinReferences = parseIconMixinReferences(iconsScssContent)
  const icons = buildIconGroups(svgFiles, svgContents, rawIconVariableMap, iconMixinReferences, layout.sourceDir)

  const components = buildComponents(allStyleScssFiles, styleSourceFiles, uiSourceFiles, layout.sourceDir)
  const searchableFiles = buildSearchableFiles(
    allStyleScssFiles,
    scssContents,
    styleSourceFiles,
    styleSourceContents,
    uiSourceFiles,
    uiSourceContents,
    layout.sourceDir
  )
  const entrypoints = buildEntrypoints(layout.sourceDir, layout)

  return {
    sourceDir: layout.sourceDir,
    stylePackageDir: layout.stylePackageDir,
    uiComponentsDir: layout.uiComponentsDir,
    packageInfo,
    generatedAt: new Date().toISOString(),
    tokens,
    tokenMap,
    mixins,
    icons,
    components,
    searchableFiles,
    entrypoints,
  }
}

export function getPackageInfo(catalog: Catalog): PackageInfo {
  return catalog.packageInfo
}

export function listTokens(
  catalog: Catalog,
  options: { tokenType?: TokenType | 'all'; category?: 'all' | TokenCategory | 'color' | 'font' | 'space' | 'layout' } = {}
): Token[] {
  const tokenType = options.tokenType ?? 'all'
  const category = normalizeListTokenCategory(options.category)

  return catalog.tokens.filter((token) => {
    if (tokenType !== 'all' && token.tokenType !== tokenType) {
      return false
    }
    if (category !== 'all' && token.category !== category) {
      return false
    }
    return true
  })
}

export function searchTokens(
  catalog: Catalog,
  options: {
    query?: string
    category?: 'all' | TokenCategory | 'fonts' | 'sizes' | 'spacings' | 'semantic'
    limit?: number
  } = {}
): Token[] {
  const normalizedQuery = options.query?.trim().toLowerCase()
  const normalizedCategory = normalizeTokenCategory(options.category)

  return catalog.tokens
    .filter((token) => {
      if (normalizedCategory !== 'all' && token.category !== normalizedCategory) {
        return false
      }
      if (!normalizedQuery) {
        return true
      }
      return [token.name, token.rawValue, token.resolvedValue ?? '', token.comment ?? '', token.filePath]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
    .slice(0, options.limit ?? 20)
}

export function getToken(catalog: Catalog, name: string, context?: string): Token | null {
  const normalizedName = normalizeName(name)
  const resolvedContext = context ? resolveContextName(context).context : null
  if (context && normalizedName.startsWith('--')) {
    return catalog.tokenMap.get(`theme-${resolvedContext}.${normalizedName.replace(/^--/, '')}`) ?? null
  }
  if (context && !normalizedName.includes('.') && name.trim().startsWith('--')) {
    return catalog.tokenMap.get(`theme-${resolvedContext}.${normalizedName.replace(/^--/, '')}`) ?? null
  }
  return catalog.tokenMap.get(normalizedName) ?? null
}

function toThemeToken(token: Token): ThemeToken {
  return {
    rawValue: token.rawValue,
    resolvedValue: token.resolvedValue,
    category: token.category,
    context: token.context,
    cssName: token.cssName,
    source: {
      file: token.filePath,
      line: token.lineNumber,
    },
    dependencies: token.dependencyChain,
    unresolved: token.unresolved,
  }
}

export function getTheme(
  catalog: Catalog,
  options: {
    context?: string
    includeReferenceTokens?: boolean
    includeSemanticTokens?: boolean
    includeAssets?: boolean
  } = {}
): ThemeResult {
  const includeReferenceTokens = options.includeReferenceTokens !== false
  const includeSemanticTokens = options.includeSemanticTokens !== false
  const includeAssets = options.includeAssets !== false

  const requestedContext = options.context ?? 'default'
  const contextResolution = resolveContextName(requestedContext)
  const context = contextResolution.context
  const diagnostics: string[] = []
  if (contextResolution.aliasFor) {
    diagnostics.push(
      `Requested KTH Style context "${requestedContext}" maps to package semantic context "${context}" because the installed @kth/style package exposes theme-${context}, not theme-${contextResolution.requested}.`
    )
  }
  const availableContexts = [
    ...new Set(
      catalog.tokens
        .filter((token) => token.tokenType === 'semantic' && token.context)
        .map((token) => token.context as string)
    ),
  ].sort()

  if (!availableContexts.includes(context)) {
    diagnostics.push(
      `Unsupported or unresolved KTH Style context "${requestedContext}". No theme-${context} semantic tokens were found in the installed @kth/style package. Available contexts: ${
        availableContexts.length > 0 ? availableContexts.join(', ') : 'none'
      }.`
    )
  }

  const referenceTokens = !includeReferenceTokens
    ? {}
    : Object.fromEntries(
        catalog.tokens
          .filter((token) => token.tokenType === 'reference')
          .map((token) => [`$${token.name}`, toThemeToken(token)])
      )
  const semanticTokens = !includeSemanticTokens
    ? {}
    : Object.fromEntries(
        catalog.tokens
          .filter((token) => token.tokenType === 'semantic' && token.context === context)
          .map((token) => [token.cssName ?? token.name, toThemeToken(token)])
      )

  const allDiagnostics = [...catalog.packageInfo.diagnostics, ...diagnostics]

  return {
    package: {
      name: catalog.packageInfo.name,
      version: catalog.packageInfo.version,
      packagePath: catalog.packageInfo.packagePath,
      assetsPath: catalog.packageInfo.assetRoot,
      source: catalog.packageInfo.source,
    },
    request: {
      context: requestedContext,
      includeReferenceTokens,
      includeSemanticTokens,
      includeAssets,
    },
    context,
    availableContexts,
    tokens: {
      reference: referenceTokens,
      semantic: semanticTokens,
    },
    assets: !includeAssets
      ? { fontsCss: null, assetRoot: catalog.packageInfo.assetRoot, availableFiles: [], logotypes: [] }
      : {
          fontsCss: catalog.packageInfo.availableFiles.css.find((filePath) => filePath.endsWith('/assets/fonts.css')) ?? null,
          assetRoot: catalog.packageInfo.assetRoot,
          availableFiles: catalog.packageInfo.availableFiles.assets,
          logotypes: catalog.icons
            .filter((icon) => icon.kind === 'logotype')
            .map((icon) => ({
              name: icon.name,
              filePath: icon.variants[0]?.filePath ?? null,
              relativePath: icon.variants[0]?.relativePath ?? null,
            })),
        },
    scss: {
      recommendedImports: catalog.entrypoints
        .filter((entrypoint) => entrypoint.type === 'sass' || entrypoint.type === 'css')
        .map((entrypoint) => entrypoint.relativePath),
    },
    diagnostics: allDiagnostics,
    warnings: allDiagnostics,
  }
}

export function searchMixins(catalog: Catalog, query?: string, limit = 20): Mixin[] {
  const normalizedQuery = query?.trim().toLowerCase()

  return catalog.mixins
    .filter((mixin) => {
      if (!normalizedQuery) {
        return true
      }
      return [mixin.name, mixin.parameters ?? '', mixin.signature, mixin.description ?? '', mixin.filePath]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
    .slice(0, limit)
}

export function listComponents(
  catalog: Catalog,
  options: { kind?: 'all' | ComponentKind; query?: string; limit?: number } = {}
): Component[] {
  const normalizedQuery = options.query?.trim().toLowerCase()

  return catalog.components
    .filter((component) => {
      if (options.kind && options.kind !== 'all' && component.kind !== options.kind) {
        return false
      }
      if (!normalizedQuery) {
        return true
      }
      return [component.name, component.relativePath, component.kind].join(' ').toLowerCase().includes(normalizedQuery)
    })
    .slice(0, options.limit ?? 40)
}

export function searchIcons(
  catalog: Catalog,
  options: { query?: string; color?: string; limit?: number } = {}
): IconGroup[] {
  const normalizedQuery = options.query?.trim().toLowerCase()
  const normalizedColor = options.color?.trim().toLowerCase()

  return catalog.icons
    .filter((icon) => {
      if (normalizedColor && normalizedColor !== 'default') {
        return false
      }
      if (!normalizedQuery) {
        return true
      }
      return [
        icon.name,
        ...icon.variants.flatMap((variant) => [variant.relativePath ?? '', variant.dataUriVariable ?? '', variant.scssMixin ?? '']),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
    .slice(0, options.limit ?? 30)
}

export function getIcon(catalog: Catalog, name: string, color?: string): IconGroup | null {
  if (color && color.toLowerCase() !== 'default') {
    return null
  }

  return catalog.icons.find((icon) => normalizeName(icon.name) === normalizeName(name)) ?? null
}

export function searchStyles(
  catalog: Catalog,
  options: { query: string; kind?: SearchKind; limit?: number }
): Array<{ filePath: string; relativePath: string; kind: ComponentKind; lineNumber: number; snippet: string }> {
  const normalizedQuery = options.query.trim().toLowerCase()
  const matches: Array<{ filePath: string; relativePath: string; kind: ComponentKind; lineNumber: number; snippet: string }> = []

  for (const file of catalog.searchableFiles) {
    if (!matchesSearchKind(options.kind ?? 'all', file.kind)) {
      continue
    }

    const lines = file.content.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (line.toLowerCase().includes(normalizedQuery)) {
        matches.push({
          filePath: file.filePath,
          relativePath: file.relativePath,
          kind: file.kind,
          lineNumber: index + 1,
          snippet: line.trim(),
        })
        if (matches.length >= (options.limit ?? 20)) {
          return matches
        }
      }
    }
  }

  return matches
}

async function buildPackageInfo(
  layout: SourceLayout,
  scssFiles: string[],
  svgFiles: string[],
  source: DiscoverySource
): Promise<PackageInfo> {
  const diagnostics: string[] = []
  const packageJsonPath = path.join(layout.stylePackageDir, 'package.json')
  const packageJsonRaw = await readUtf8(packageJsonPath)
  let packageJson: { name?: string; version?: string }
  try {
    packageJson = JSON.parse(packageJsonRaw) as { name?: string; version?: string }
  } catch (error) {
    throw new ParserError(
      `Failed to parse @kth/style package.json at ${packageJsonPath}: ${(error as Error).message}`
    )
  }
  if (!packageJson.version) {
    diagnostics.push(`Installed @kth/style package version is unavailable in ${packageJsonPath}.`)
  }

  if (source === 'monorepo-default') {
    diagnostics.push(
      `KTH Style values were loaded from the monorepo default fallback at ${layout.stylePackageDir}, not from an installed node_modules/@kth/style package. Install @kth/style or set KTH_STYLE_SOURCE_DIR for authoritative resolution.`
    )
  }

  const fontsCssPath = path.join(layout.stylePackageDir, 'assets/fonts.css')
  const cssFiles = (await pathExists(fontsCssPath)) ? [fontsCssPath] : []
  if (cssFiles.length === 0) {
    diagnostics.push(`Font CSS was not found at ${fontsCssPath}.`)
  }

  return {
    name: '@kth/style',
    version: packageJson.version ?? null,
    packagePath: layout.stylePackageDir,
    assetRoot: path.join(layout.stylePackageDir, 'assets'),
    source,
    availableFiles: {
      sass: scssFiles.map((filePath) => normalizeRelativePackagePath(layout.stylePackageDir, filePath)),
      css: cssFiles.map((filePath) => normalizeRelativePackagePath(layout.stylePackageDir, filePath)),
      tokens: scssFiles
        .filter((filePath) => filePath.replace(/\\/g, '/').includes('/scss/tokens/'))
        .map((filePath) => normalizeRelativePackagePath(layout.stylePackageDir, filePath)),
      assets: svgFiles.map((filePath) => normalizeRelativePackagePath(layout.stylePackageDir, filePath)),
    },
    diagnostics,
  }
}

function parseTopLevelVariables(filePath: string, content: string, category: TokenCategory): Token[] {
  const state: ParseState = { braceDepth: 0, pendingComments: [] }
  const tokens: Token[] = []
  const lines = content.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    const line = rawLine.trim()

    if (line.startsWith('//')) {
      state.pendingComments.push(line.replace(/^\/\/\s?/, '').trim())
      state.braceDepth += getBraceDelta(rawLine)
      continue
    }

    if (state.braceDepth === 0) {
      const match = rawLine.match(TOP_LEVEL_VARIABLE_PATTERN)
      if (match) {
        tokens.push({
          name: match[1],
          tokenType: 'reference',
          category,
          filePath,
          lineNumber: index + 1,
          rawValue: match[2].trim(),
          resolvedValue: null,
          comment: [state.pendingComments.join(' '), match[3] ?? ''].join(' ').trim() || null,
          context: null,
          cssName: null,
          dependencyChain: [],
          unresolved: null,
        })
      }
    }

    if (line !== '') {
      state.pendingComments = []
    }
    state.braceDepth += getBraceDelta(rawLine)
  }

  return tokens
}

function parseThemeTokens(filePath: string, content: string, tokenMap: Map<string, Token>): Token[] {
  const tokens: Token[] = []
  let currentTheme: string | null = null
  let braceDepth = 0
  const lines = content.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    const line = rawLine.trim()
    const mixinMatch = braceDepth === 0 ? rawLine.match(MIXIN_PATTERN) : null
    if (mixinMatch && mixinMatch[1].startsWith('theme-')) {
      currentTheme = mixinMatch[1]
    }

    if (currentTheme) {
      const themeVariableMatch = rawLine.match(THEME_VARIABLE_PATTERN)
      if (themeVariableMatch) {
        const rawValue = themeVariableMatch[2].trim()
        const resolution = resolveTokenValueWithChain(rawValue, tokenMap)
        tokens.push({
          name: `${currentTheme}.${themeVariableMatch[1]}`,
          tokenType: 'semantic',
          category: 'themes',
          filePath,
          lineNumber: index + 1,
          rawValue,
          resolvedValue: resolution.resolvedValue,
          comment: themeVariableMatch[3]?.trim() || currentTheme,
          context: currentTheme.replace(/^theme-/, ''),
          cssName: `--${themeVariableMatch[1]}`,
          dependencyChain: resolution.dependencyChain,
          unresolved: resolution.unresolved,
        })
      }
    }

    braceDepth += getBraceDelta(rawLine)
    if (currentTheme && braceDepth === 0 && line.endsWith('}')) {
      currentTheme = null
    }
  }

  return tokens
}

function parseMixins(filePath: string, content: string): Mixin[] {
  const state: ParseState = { braceDepth: 0, pendingComments: [] }
  const mixins: Mixin[] = []

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('//')) {
      state.pendingComments.push(line.replace(/^\/\/\s?/, '').trim())
      state.braceDepth += getBraceDelta(rawLine)
      continue
    }

    if (state.braceDepth === 0) {
      const match = rawLine.match(MIXIN_PATTERN)
      if (match) {
        mixins.push({
          name: match[1],
          parameters: match[2]?.trim() || null,
          signature: rawLine.trim(),
          filePath,
          description: state.pendingComments.join(' ').trim() || null,
        })
      }
    }

    if (line !== '') {
      state.pendingComments = []
    }
    state.braceDepth += getBraceDelta(rawLine)
  }

  return mixins
}

function parseRawIconVariables(content: string): Map<string, string> {
  const rawVariableMap = new Map<string, string>()

  for (const rawLine of content.split(/\r?\n/)) {
    const match = rawLine.match(TOP_LEVEL_VARIABLE_PATTERN)
    if (!match || !match[1].startsWith('icon-')) {
      continue
    }
    rawVariableMap.set(match[1].replace(/^icon-/, ''), `$${match[1]}`)
  }

  return rawVariableMap
}

function parseIconMixinReferences(content: string): Map<string, IconMixinReference> {
  const iconMixins = new Map<string, IconMixinReference>()
  let currentMixin: string | null = null
  let braceDepth = 0

  for (const rawLine of content.split(/\r?\n/)) {
    const mixinMatch = braceDepth === 0 ? rawLine.match(MIXIN_PATTERN) : null
    if (mixinMatch && mixinMatch[1].startsWith('icon-')) {
      currentMixin = mixinMatch[1]
    }

    if (currentMixin) {
      const rawReferenceMatch = rawLine.match(RAW_ICON_REFERENCE_PATTERN)
      if (rawReferenceMatch) {
        const logicalName = currentMixin.replace(/^icon-/, '')
        const sourceIconName = rawReferenceMatch[1].replace(/^icon-/, '')
        iconMixins.set(logicalName, {
          logicalName,
          mixinName: currentMixin,
          rawVariableName: `$${rawReferenceMatch[1]}`,
          sourceIconName,
        })
      }
    }

    braceDepth += getBraceDelta(rawLine)
    if (currentMixin && braceDepth === 0 && rawLine.trim().endsWith('}')) {
      currentMixin = null
    }
  }

  return iconMixins
}

function buildIconGroups(
  svgFiles: string[],
  svgContents: string[],
  rawIconVariableMap: Map<string, string>,
  iconMixinReferences: Map<string, IconMixinReference>,
  sourceDir: string
): IconGroup[] {
  const grouped = new Map<string, IconGroup>()

  svgFiles.forEach((filePath, index) => {
    const relativePath = path.relative(sourceDir, filePath)
    const stem = path.basename(filePath, '.svg')
    const iconMixins = iconMixinReferences.get(stem)

    grouped.set(stem, {
      name: stem,
      kind: relativePath.includes('/logotype/') ? 'logotype' : 'icon',
      variants: [
        {
          variant: 'default',
          filePath,
          relativePath,
          svg: svgContents[index],
          dataUriVariable: rawIconVariableMap.get(stem) ?? null,
          scssMixin: iconMixins?.mixinName ?? null,
        },
      ],
    })
  })

  for (const [logicalName, reference] of iconMixinReferences) {
    if (grouped.has(logicalName)) {
      const existing = grouped.get(logicalName)
      if (existing) {
        existing.variants[0].scssMixin = reference.mixinName
        existing.variants[0].dataUriVariable ??= reference.rawVariableName
      }
      continue
    }

    const referencedGroup = grouped.get(reference.sourceIconName)
    grouped.set(logicalName, {
      name: logicalName,
      kind: 'icon',
      variants: [
        {
          variant: 'default',
          filePath: referencedGroup?.variants[0]?.filePath ?? null,
          relativePath: referencedGroup?.variants[0]?.relativePath ?? null,
          svg: referencedGroup?.variants[0]?.svg ?? null,
          dataUriVariable: reference.rawVariableName,
          scssMixin: reference.mixinName,
        },
      ],
    })
  }

  return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function buildComponents(
  scssFiles: string[],
  styleSourceFiles: string[],
  uiSourceFiles: string[],
  sourceDir: string
): Component[] {
  const scssComponents = scssFiles.flatMap<Component>((filePath) => {
    const relativePath = path.relative(sourceDir, filePath)
    const normalizedPath = relativePath.replace(/\\/g, '/')
    const name = path.basename(filePath, '.scss')

    if (normalizedPath.includes('/scss/components/')) {
      return [{ name, kind: 'style-component', filePath, relativePath, importPath: scssImportPath(relativePath) }]
    }
    if (normalizedPath.includes('/scss/tokens/')) {
      return [{ name, kind: 'token', filePath, relativePath, importPath: scssImportPath(relativePath) }]
    }
    if (normalizedPath.includes('/scss/utils/')) {
      return [{ name, kind: 'util', filePath, relativePath, importPath: scssImportPath(relativePath) }]
    }
    return []
  })

  const styleScripts = styleSourceFiles.map<Component>((filePath) => ({
    name: path.basename(filePath, path.extname(filePath)),
    kind: 'style-script',
    filePath,
    relativePath: path.relative(sourceDir, filePath),
    importPath: null,
  }))

  const uiComponents = uiSourceFiles
    .filter((filePath) => filePath.replace(/\\/g, '/').includes('/src/components/'))
    .map<Component>((filePath) => ({
      name: path.basename(filePath, path.extname(filePath)),
      kind: 'ui-component',
      filePath,
      relativePath: path.relative(sourceDir, filePath),
      importPath: null,
    }))

  return [...scssComponents, ...styleScripts, ...uiComponents].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  )
}

function buildSearchableFiles(
  scssFiles: string[],
  scssContents: string[],
  styleSourceFiles: string[],
  styleSourceContents: string[],
  uiSourceFiles: string[],
  uiSourceContents: string[],
  sourceDir: string
): SearchableFile[] {
  const scssSearchables = scssFiles.map<SearchableFile>((filePath, index) => ({
    filePath,
    relativePath: path.relative(sourceDir, filePath),
    kind: classifyScssFile(filePath, sourceDir),
    content: scssContents[index],
  }))

  const styleSourceSearchables = styleSourceFiles.map<SearchableFile>((filePath, index) => ({
    filePath,
    relativePath: path.relative(sourceDir, filePath),
    kind: 'style-script',
    content: styleSourceContents[index],
  }))

  const uiSourceSearchables = uiSourceFiles.map<SearchableFile>((filePath, index) => ({
    filePath,
    relativePath: path.relative(sourceDir, filePath),
    kind: filePath.replace(/\\/g, '/').includes('/src/components/') ? 'ui-component' : 'style-script',
    content: uiSourceContents[index],
  }))

  return [...scssSearchables, ...styleSourceSearchables, ...uiSourceSearchables]
}

function classifyScssFile(filePath: string, sourceDir: string): ComponentKind {
  const relativePath = path.relative(sourceDir, filePath).replace(/\\/g, '/')
  if (relativePath.includes('/scss/components/')) {
    return 'style-component'
  }
  if (relativePath.includes('/scss/utils/')) {
    return 'util'
  }
  return 'token'
}

function buildEntrypoints(sourceDir: string, layout: SourceLayout): EntryPoint[] {
  const entries: EntryPoint[] = [
    {
      name: 'reset',
      type: 'sass',
      relativePath: path.relative(sourceDir, path.join(layout.stylePackageDir, 'scss/utils/reset.scss')),
      description: 'Global reset stylesheet that consumers usually import before component styles.',
    },
    {
      name: 'header',
      type: 'sass',
      relativePath: path.relative(sourceDir, path.join(layout.stylePackageDir, 'scss/components/header.scss')),
      description: 'Header styles with public/intranet/student-web/external theme variants.',
    },
    {
      name: 'footer',
      type: 'sass',
      relativePath: path.relative(sourceDir, path.join(layout.stylePackageDir, 'scss/components/footer.scss')),
      description: 'Footer styles with theme variants that mirror the header model.',
    },
    {
      name: 'content',
      type: 'sass',
      relativePath: path.relative(sourceDir, path.join(layout.stylePackageDir, 'scss/components/content.scss')),
      description: 'Main content container styles and spacing helpers.',
    },
    {
      name: 'mobile-menu',
      type: 'sass',
      relativePath: path.relative(sourceDir, path.join(layout.stylePackageDir, 'scss/components/mobile-menu.scss')),
      description: 'Dialog-based mobile navigation styling.',
    },
    {
      name: 'local-navigation',
      type: 'sass',
      relativePath: path.relative(sourceDir, path.join(layout.stylePackageDir, 'scss/components/local-navigation.scss')),
      description: 'Desktop and mobile local navigation styling.',
    },
    {
      name: 'fonts',
      type: 'css',
      relativePath: path.relative(sourceDir, path.join(layout.stylePackageDir, 'assets/fonts.css')),
      description: 'Font-face declarations for Figtree and related assets.',
    },
    {
      name: 'style-index',
      type: 'js',
      relativePath: path.relative(sourceDir, path.join(layout.stylePackageDir, 'src/index.ts')),
      description: 'Main non-React TypeScript exports for @kth/style.',
    },
    {
      name: 'menu-panel-script',
      type: 'js',
      relativePath: path.relative(sourceDir, path.join(layout.stylePackageDir, 'src/components/MenuPanel.ts')),
      description: 'Dialog behavior for menu panels and mobile menu overlays.',
    },
    {
      name: 'local-navigation-script',
      type: 'js',
      relativePath: path.relative(sourceDir, path.join(layout.stylePackageDir, 'src/localNavigation.ts')),
      description: 'Legacy local-navigation cloning for mobile menu lists.',
    },
  ]

  if (layout.uiComponentsDir) {
    entries.push({
      name: 'ui-components-index',
      type: 'js',
      relativePath: path.relative(sourceDir, path.join(layout.uiComponentsDir, 'src/index.ts')),
      description: 'React component exports for @kth/ui-components.',
    })
  }

  return entries
}

function normalizeName(name: string): string {
  return name.replace(/^\$/, '').trim().toLowerCase()
}

function normalizeContextName(context: string): string {
  return context.trim().replace(/^theme-/, '').toLowerCase()
}

function resolveContextName(context: string): { requested: string; context: string; aliasFor: string | null } {
  const requested = normalizeContextName(context)
  const aliased = CONTEXT_ALIASES.get(requested) ?? null
  return {
    requested,
    context: aliased ?? requested,
    aliasFor: aliased,
  }
}

function normalizeTokenCategory(
  category?: 'all' | TokenCategory | 'fonts' | 'sizes' | 'spacings' | 'semantic'
): 'all' | TokenCategory {
  if (!category || category === 'all') {
    return 'all'
  }
  if (category === 'fonts') {
    return 'typography'
  }
  if (category === 'sizes' || category === 'spacings') {
    return 'spacing'
  }
  if (category === 'semantic') {
    return 'themes'
  }
  return category
}

function normalizeListTokenCategory(
  category?: 'all' | TokenCategory | 'color' | 'font' | 'space' | 'layout'
): 'all' | TokenCategory {
  if (!category || category === 'all') {
    return 'all'
  }
  if (category === 'color') {
    return 'colors'
  }
  if (category === 'font') {
    return 'typography'
  }
  if (category === 'space' || category === 'layout') {
    return 'spacing'
  }
  return category
}

function matchesSearchKind(requestedKind: SearchKind, fileKind: ComponentKind): boolean {
  if (requestedKind === 'all') {
    return true
  }
  if (requestedKind === 'scss') {
    return fileKind === 'style-component' || fileKind === 'token' || fileKind === 'util'
  }
  if (requestedKind === 'js') {
    return fileKind === 'style-script' || fileKind === 'ui-component'
  }
  return requestedKind === fileKind
}

function resolveTokenValueWithChain(
  rawValue: string,
  tokenMap: Map<string, Token>,
  seen = new Set<string>()
): { resolvedValue: string | null; dependencyChain: string[]; unresolved: string | null } {
  const trimmed = unwrapInterpolation(rawValue.trim())

  if (!trimmed.includes('$')) {
    return { resolvedValue: trimmed, dependencyChain: [], unresolved: null }
  }

  const directReference = trimmed.match(/^\$([\w-]+)$/)
  if (!directReference) {
    return { resolvedValue: null, dependencyChain: [], unresolved: rawValue }
  }

  const tokenName = normalizeName(directReference[1])
  if (seen.has(tokenName)) {
    return { resolvedValue: null, dependencyChain: [`$${directReference[1]}`], unresolved: rawValue }
  }

  const referenced = tokenMap.get(tokenName)
  if (!referenced) {
    return { resolvedValue: null, dependencyChain: [`$${directReference[1]}`], unresolved: rawValue }
  }

  seen.add(tokenName)
  const nested = resolveTokenValueWithChain(referenced.rawValue, tokenMap, seen)
  return {
    resolvedValue: nested.resolvedValue ?? referenced.rawValue,
    dependencyChain: [`$${referenced.name}`, ...nested.dependencyChain],
    unresolved: nested.unresolved,
  }
}

function unwrapInterpolation(value: string): string {
  const interpolationMatch = value.match(/^#\{\s*(\$[\w-]+)\s*\}$/)
  return interpolationMatch ? interpolationMatch[1] : value
}

function normalizeRelativePackagePath(packageDir: string, filePath: string): string {
  return `@kth/style/${path.relative(packageDir, filePath).replace(/\\/g, '/')}`
}

function scssImportPath(relativePath: string): string {
  const normalizedPath = relativePath.replace(/\\/g, '/')
  const packagePath = normalizedPath.includes('@kth/style/')
    ? normalizedPath.slice(normalizedPath.indexOf('@kth/style/'))
    : `@kth/style/${normalizedPath}`
  return packagePath.replace(/\.scss$/, '')
}

async function resolveSourceLayout(requestedSourceDir: string): Promise<SourceLayout> {
  await assertDirectory(requestedSourceDir)

  const directPackageJson = path.join(requestedSourceDir, 'package.json')
  if (await isStylePackageDirectory(requestedSourceDir, directPackageJson)) {
    const maybeUiComponentsDir = path.join(path.dirname(requestedSourceDir), 'ui-components')
    return {
      sourceDir: requestedSourceDir,
      stylePackageDir: requestedSourceDir,
      uiComponentsDir: (await pathExists(maybeUiComponentsDir)) ? maybeUiComponentsDir : null,
    }
  }

  const stylePackageDir = path.join(requestedSourceDir, '@kth/style')
  if (!(await pathExists(stylePackageDir))) {
    throw new PackageNotFoundError(
      `KTH Style package not found in ${requestedSourceDir}. Install @kth/style (npm i @kth/style) or set KTH_STYLE_SOURCE_DIR to the style monorepo root or the @kth/style package directory.`
    )
  }

  const uiComponentsDir = path.join(requestedSourceDir, '@kth/ui-components')
  return {
    sourceDir: requestedSourceDir,
    stylePackageDir,
    uiComponentsDir: (await pathExists(uiComponentsDir)) ? uiComponentsDir : null,
  }
}

async function isStylePackageDirectory(directoryPath: string, packageJsonPath: string): Promise<boolean> {
  if (!(await pathExists(packageJsonPath))) {
    return false
  }

  const packageJson = JSON.parse(await readUtf8(packageJsonPath)) as { name?: string }
  return packageJson.name === '@kth/style' && (await pathExists(path.join(directoryPath, 'scss')))
}

async function walk(directoryPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true })
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directoryPath, entry.name)
        if (entry.isDirectory()) {
          return walk(entryPath)
        }
        return [entryPath]
      })
    )
    return nested.flat().filter((filePath) => EXTENSION_PATTERN.test(filePath))
  } catch (error) {
    const typedError = error as NodeJS.ErrnoException
    if (typedError.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

async function assertDirectory(directoryPath: string): Promise<void> {
  let stats
  try {
    stats = await fs.stat(directoryPath)
  } catch {
    throw new PackageNotFoundError(
      `KTH Style package directory not found: ${directoryPath}. Install @kth/style (npm i @kth/style) or set KTH_STYLE_SOURCE_DIR to the cloned style monorepo or the @kth/style package directory.`
    )
  }

  if (!stats.isDirectory()) {
    throw new PackageNotFoundError(`KTH Style source path is not a directory: ${directoryPath}`)
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readUtf8(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8')
}

function getBraceDelta(line: string): number {
  const uncommented = line.replace(/\/\/.*$/, '')
  const opens = uncommented.match(/\{/g)?.length ?? 0
  const closes = uncommented.match(/\}/g)?.length ?? 0
  return opens - closes
}

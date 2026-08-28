import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  buildCatalog,
  discoverStyleSource,
  getIcon,
  getPackageInfo,
  getTheme,
  getToken,
  listComponents,
  listTokens,
  PackageNotFoundError,
  ParserError,
  searchIcons,
  searchMixins,
  searchStyles,
  searchTokens,
} from '../src/catalog.js'

const fixtureSourceDir = path.resolve('test/fixtures/style')
const fixtureStylePackageDir = path.resolve('test/fixtures/style/@kth/style')

test('buildCatalog parses primitive and theme tokens from the style monorepo layout', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)

  assert.equal(getToken(catalog, 'color-blue-kth')?.rawValue, '#004791')
  assert.equal(getToken(catalog, '$color-blue-kth')?.tokenType, 'reference')
  assert.equal(getToken(catalog, 'theme-default.color-primary')?.resolvedValue, '#004791')
  assert.deepEqual(getToken(catalog, '--color-primary', 'default')?.dependencyChain, ['$color-blue-kth'])
  assert.equal(getToken(catalog, 'theme-default.space-inner-inline')?.resolvedValue, '1rem')
  assert.equal(getToken(catalog, 'breakpoint-64') ?? null, null)

  const typographyTokens = searchTokens(catalog, { category: 'typography' }).map((token) => token.name)
  assert.ok(typographyTokens.includes('font-figtree'))
})

test('package info exposes exact installed package metadata and files', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)
  const info = getPackageInfo(catalog)

  assert.equal(info.name, '@kth/style')
  assert.equal(info.version, '1.14.1')
  assert.ok(info.packagePath.endsWith('test/fixtures/style/@kth/style'))
  assert.ok(info.availableFiles.tokens.includes('@kth/style/scss/tokens/colors.scss'))
  assert.ok(info.availableFiles.css.includes('@kth/style/assets/fonts.css'))
})

test('listTokens separates exact reference and semantic token families', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)

  const referenceColors = listTokens(catalog, { tokenType: 'reference', category: 'color' })
  assert.ok(referenceColors.some((token) => token.name === 'color-blue-kth' && token.rawValue === '#004791'))
  assert.ok(referenceColors.every((token) => token.tokenType === 'reference'))

  const semanticTokens = listTokens(catalog, { tokenType: 'semantic' })
  assert.ok(semanticTokens.some((token) => token.name === 'theme-intranet.color-tertiary' && token.resolvedValue === '#004791'))
  assert.ok(semanticTokens.every((token) => token.name.startsWith('theme-') && token.cssName?.startsWith('--')))
})

test('getTheme returns a deterministic package-backed theme object', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)
  const theme = getTheme(catalog, { context: 'intranet', includeAssets: true })

  assert.deepEqual(Object.keys(theme), [
    'package',
    'request',
    'context',
    'availableContexts',
    'tokens',
    'assets',
    'scss',
    'diagnostics',
    'warnings',
  ])
  assert.equal(theme.package.version, '1.14.1')
  assert.equal(theme.package.source, 'explicit')
  assert.ok(theme.package.assetsPath.endsWith('@kth/style/assets'))
  assert.deepEqual(theme.request, {
    context: 'intranet',
    includeReferenceTokens: true,
    includeSemanticTokens: true,
    includeAssets: true,
  })
  assert.equal(theme.context, 'intranet')
  assert.ok(theme.availableContexts.includes('intranet'))
  assert.equal(theme.tokens.reference['$color-blue-kth'].resolvedValue, '#004791')
  assert.deepEqual(theme.tokens.reference['$color-blue-kth'].source, {
    file: theme.tokens.reference['$color-blue-kth'].source.file,
    line: theme.tokens.reference['$color-blue-kth'].source.line,
  })
  assert.ok(theme.tokens.reference['$color-blue-kth'].source.file.endsWith('colors.scss'))
  assert.equal(theme.tokens.semantic['--color-tertiary'].resolvedValue, '#004791')
  assert.deepEqual(theme.tokens.semantic['--color-tertiary'].dependencies, ['$color-blue-kth'])
  assert.ok(theme.assets.fontsCss?.endsWith('@kth/style/assets/fonts.css'))
  assert.ok(theme.scss.recommendedImports.includes('@kth/style/scss/components/header.scss'))
  assert.deepEqual(theme.diagnostics, [])
  assert.deepEqual(theme.warnings, theme.diagnostics)
})

test('external web context resolves to the package-backed inverse semantic theme', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)
  const theme = getTheme(catalog, { context: 'external', includeReferenceTokens: false })

  assert.equal(theme.context, 'inverse')
  assert.equal(theme.tokens.semantic['--color-primary'].resolvedValue, '#fcfcfc')
  assert.ok(theme.warnings.some((warning) => warning.includes('external') && warning.includes('inverse')))
  assert.equal(getToken(catalog, '--color-primary', 'external')?.name, 'theme-inverse.color-primary')
})

test('getTheme reports unsupported contexts without inventing values', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)
  const theme = getTheme(catalog, { context: 'dark', includeReferenceTokens: false })

  assert.equal(theme.context, 'dark')
  assert.deepEqual(theme.tokens.semantic, {})
  assert.ok(theme.warnings.some((warning) => warning.includes('No theme-dark semantic tokens were found')))
})

test('unknown tokens return null so tools can emit unresolved diagnostics', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)

  assert.equal(getToken(catalog, '--color-primary', 'dark'), null)
  assert.equal(getToken(catalog, '$color-made-up'), null)
})

test('unresolved aliases keep raw references and diagnostics', async (t) => {
  const fixtureRoot = path.resolve('tmp/unresolved-kth-style-fixture')
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const packageRoot = path.join(fixtureRoot, '@kth/style')
  await mkdir(path.join(packageRoot, 'scss/tokens'), { recursive: true })
  await mkdir(path.join(packageRoot, 'scss/components'), { recursive: true })
  await mkdir(path.join(packageRoot, 'scss/utils'), { recursive: true })
  await mkdir(path.join(packageRoot, 'src'), { recursive: true })
  await mkdir(path.join(packageRoot, 'icons'), { recursive: true })
  await mkdir(path.join(packageRoot, 'assets'), { recursive: true })
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@kth/style', version: '1.14.1' }))
  await writeFile(path.join(packageRoot, 'scss/tokens/colors.scss'), '$color-known: #004791;\n@mixin theme-default {\n  --color-primary: #{$color-missing};\n}\n')
  await writeFile(path.join(packageRoot, 'scss/tokens/typography.scss'), '$font-figtree: "Figtree";\n')
  await writeFile(path.join(packageRoot, 'scss/tokens/spacing.scss'), '$space-16: 1rem;\n')
  await writeFile(path.join(packageRoot, 'scss/tokens/icons.scss'), '')
  await writeFile(path.join(packageRoot, 'scss/tokens/icons-raw.scss'), '')
  await writeFile(path.join(packageRoot, 'assets/fonts.css'), '')

  const catalog = await buildCatalog(fixtureRoot)
  const token = getToken(catalog, '--color-primary', 'default')

  assert.equal(token?.rawValue, '#{$color-missing}')
  assert.equal(token?.resolvedValue, null)
  assert.equal(token?.unresolved, '#{$color-missing}')
})

test('missing package reports a package-not-found diagnostic error', async (t) => {
  const missingRoot = path.resolve('tmp/missing-kth-style-fixture')
  t.after(() => rm(missingRoot, { recursive: true, force: true }))
  await mkdir(missingRoot, { recursive: true })

  await assert.rejects(() => buildCatalog(missingRoot), (error: unknown) => {
    assert.ok(error instanceof PackageNotFoundError)
    assert.match((error as Error).message, /KTH Style package not found/)
    return true
  })
})

test('discoverStyleSource records explicit and source-dir provenance', () => {
  assert.deepEqual(discoverStyleSource('/tmp/whatever'), { dir: path.resolve('/tmp/whatever'), source: 'explicit' })

  const previous = process.env.KTH_STYLE_SOURCE_DIR
  process.env.KTH_STYLE_SOURCE_DIR = '/tmp/source-dir'
  try {
    assert.deepEqual(discoverStyleSource(), { dir: path.resolve('/tmp/source-dir'), source: 'source-dir' })
  } finally {
    if (previous === undefined) {
      delete process.env.KTH_STYLE_SOURCE_DIR
    } else {
      process.env.KTH_STYLE_SOURCE_DIR = previous
    }
  }
})

test('discovery prefers the installed node_modules/@kth/style package', async (t) => {
  const installRoot = path.resolve('tmp/installed-kth-style-fixture')
  const packageRoot = path.join(installRoot, 'node_modules/@kth/style')
  const previousEnv = process.env.KTH_STYLE_SOURCE_DIR
  const previousDisableInstalled = process.env.KTH_STYLE_DISABLE_INSTALLED_DISCOVERY
  const previousCwd = process.cwd()
  t.after(() => {
    process.chdir(previousCwd)
    if (previousEnv === undefined) {
      delete process.env.KTH_STYLE_SOURCE_DIR
    } else {
      process.env.KTH_STYLE_SOURCE_DIR = previousEnv
    }
    if (previousDisableInstalled === undefined) {
      delete process.env.KTH_STYLE_DISABLE_INSTALLED_DISCOVERY
    } else {
      process.env.KTH_STYLE_DISABLE_INSTALLED_DISCOVERY = previousDisableInstalled
    }
    return rm(installRoot, { recursive: true, force: true })
  })

  await mkdir(path.join(packageRoot, 'scss/tokens'), { recursive: true })
  await mkdir(path.join(packageRoot, 'assets'), { recursive: true })
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@kth/style', version: '9.9.9' }))
  await writeFile(path.join(packageRoot, 'scss/tokens/colors.scss'), '$color-blue-kth: #004791;\n')
  await writeFile(path.join(packageRoot, 'scss/tokens/typography.scss'), '$font-figtree: "Figtree";\n')
  await writeFile(path.join(packageRoot, 'scss/tokens/spacing.scss'), '$space-16: 1rem;\n')
  await writeFile(path.join(packageRoot, 'scss/tokens/icons.scss'), '')
  await writeFile(path.join(packageRoot, 'scss/tokens/icons-raw.scss'), '')
  await writeFile(path.join(packageRoot, 'assets/fonts.css'), '')

  delete process.env.KTH_STYLE_SOURCE_DIR
  process.chdir(installRoot)

  const discovery = discoverStyleSource()
  assert.equal(discovery.source, 'installed')
  assert.equal(discovery.dir, packageRoot)

  const catalog = await buildCatalog()
  assert.equal(catalog.packageInfo.source, 'installed')
  assert.equal(catalog.packageInfo.version, '9.9.9')
  assert.equal(getToken(catalog, 'color-blue-kth')?.rawValue, '#004791')
  assert.deepEqual(catalog.packageInfo.diagnostics, [])
})

test('unparseable package.json produces a parser diagnostic, not guessed values', async (t) => {
  const fixtureRoot = path.resolve('tmp/parser-kth-style-fixture')
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const packageRoot = path.join(fixtureRoot, '@kth/style')
  await mkdir(path.join(packageRoot, 'scss/tokens'), { recursive: true })
  await mkdir(path.join(packageRoot, 'assets'), { recursive: true })
  await writeFile(path.join(packageRoot, 'package.json'), '{ this is not valid json')
  await writeFile(path.join(packageRoot, 'scss/tokens/colors.scss'), '$color-blue-kth: #004791;\n')
  await writeFile(path.join(packageRoot, 'scss/tokens/typography.scss'), '')
  await writeFile(path.join(packageRoot, 'scss/tokens/spacing.scss'), '')
  await writeFile(path.join(packageRoot, 'scss/tokens/icons.scss'), '')
  await writeFile(path.join(packageRoot, 'scss/tokens/icons-raw.scss'), '')

  await assert.rejects(() => buildCatalog(fixtureRoot), (error: unknown) => {
    assert.ok(error instanceof ParserError)
    assert.match((error as Error).message, /Failed to parse @kth\/style package\.json/)
    return true
  })
})

test('theme without context returns the base theme and lists available contexts', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)
  const theme = getTheme(catalog)

  assert.equal(theme.context, 'default')
  assert.equal(theme.request.context, 'default')
  assert.ok(theme.availableContexts.includes('default'))
  assert.ok(theme.availableContexts.includes('intranet'))
  assert.ok(theme.availableContexts.includes('inverse'))
  assert.ok(theme.assets.availableFiles.length >= 0)
  assert.deepEqual(theme.diagnostics, [])
})

test('monorepo-default fallback is flagged with a non-installed diagnostic', async (t) => {
  // Simulate the installed package living at the legacy ../style monorepo-default location.
  const previousEnv = process.env.KTH_STYLE_SOURCE_DIR
  const previousDisableInstalled = process.env.KTH_STYLE_DISABLE_INSTALLED_DISCOVERY
  const previousCwd = process.cwd()
  const harnessRoot = path.resolve('tmp/monorepo-default-harness')
  const cwdDir = path.join(harnessRoot, 'project')
  const stylePackageRoot = path.join(harnessRoot, 'style/@kth/style')
  t.after(() => {
    process.chdir(previousCwd)
    if (previousEnv === undefined) {
      delete process.env.KTH_STYLE_SOURCE_DIR
    } else {
      process.env.KTH_STYLE_SOURCE_DIR = previousEnv
    }
    if (previousDisableInstalled === undefined) {
      delete process.env.KTH_STYLE_DISABLE_INSTALLED_DISCOVERY
    } else {
      process.env.KTH_STYLE_DISABLE_INSTALLED_DISCOVERY = previousDisableInstalled
    }
    return rm(harnessRoot, { recursive: true, force: true })
  })

  await mkdir(cwdDir, { recursive: true })
  await mkdir(path.join(stylePackageRoot, 'scss/tokens'), { recursive: true })
  await mkdir(path.join(stylePackageRoot, 'assets'), { recursive: true })
  await writeFile(path.join(stylePackageRoot, 'package.json'), JSON.stringify({ name: '@kth/style', version: '1.0.0' }))
  await writeFile(path.join(stylePackageRoot, 'scss/tokens/colors.scss'), '$color-blue-kth: #004791;\n')
  await writeFile(path.join(stylePackageRoot, 'scss/tokens/typography.scss'), '')
  await writeFile(path.join(stylePackageRoot, 'scss/tokens/spacing.scss'), '')
  await writeFile(path.join(stylePackageRoot, 'scss/tokens/icons.scss'), '')
  await writeFile(path.join(stylePackageRoot, 'scss/tokens/icons-raw.scss'), '')
  await writeFile(path.join(stylePackageRoot, 'assets/fonts.css'), '')

  delete process.env.KTH_STYLE_SOURCE_DIR
  process.env.KTH_STYLE_DISABLE_INSTALLED_DISCOVERY = '1'
  process.chdir(cwdDir)

  const discovery = discoverStyleSource()
  assert.equal(discovery.source, 'monorepo-default')

  const catalog = await buildCatalog()
  assert.equal(catalog.packageInfo.source, 'monorepo-default')
  assert.ok(catalog.packageInfo.diagnostics.some((message) => message.includes('monorepo default fallback')))
})

test('buildCatalog exposes new icon, component, and style-search surfaces', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)

  const mixinNames = searchMixins(catalog, 'font-heading').map((mixin) => mixin.name)
  assert.ok(mixinNames.includes('font-heading-s'))

  const searchIcon = getIcon(catalog, 'search')
  assert.ok(searchIcon)
  assert.equal(searchIcon?.variants[0]?.dataUriVariable, '$icon-search')
  assert.equal(searchIcon?.variants[0]?.scssMixin, 'icon-search')

  const arrowBackIcon = getIcon(catalog, 'arrow-back')
  assert.ok(arrowBackIcon)
  assert.equal(arrowBackIcon?.variants[0]?.scssMixin, 'icon-arrow-back')

  const jsMatches = searchStyles(catalog, { query: 'mobileMenuList', kind: 'js' })
  assert.equal(jsMatches[0]?.relativePath, '@kth/style/src/localNavigation.ts')

  const uiComponents = listComponents(catalog, { kind: 'ui-component' }).map((component) => component.name)
  assert.ok(uiComponents.includes('Button'))

  const iconMatches = searchIcons(catalog, { query: 'search' })
  assert.ok(iconMatches.some((icon) => icon.name === 'search'))
})

test('real style repo smoke test', async (t) => {
  const realSourceDir = path.resolve('../style')
  if (!existsSync(realSourceDir)) {
    t.skip('Sibling style repository not found')
    return
  }

  const catalog = await buildCatalog(realSourceDir)

  assert.ok(catalog.tokens.length > 10)
  assert.ok(catalog.mixins.length > 10)
  assert.ok(catalog.icons.length > 20)
  assert.ok(catalog.components.length > 10)
  assert.ok(searchTokens(catalog, { category: 'themes', query: 'color-primary' }).length > 0)
})

test('the installed package layout indexes every SCSS component', async () => {
  // Passing the package directory itself reproduces an installed @kth/style,
  // where relative paths start at "scss/..." rather than "@kth/style/scss/...".
  // Component discovery used to miss every file in that layout.
  const catalog = await buildCatalog(fixtureStylePackageDir)

  assert.equal(catalog.sourceDir, catalog.stylePackageDir)

  const styleComponents = catalog.components.filter((component) => component.kind === 'style-component')
  assert.ok(styleComponents.length >= 23, `expected the full component set, got ${styleComponents.length}`)
  assert.ok(styleComponents.some((component) => component.name === 'header'))
  assert.ok(catalog.components.some((component) => component.kind === 'token' && component.name === 'colors'))
  assert.ok(catalog.components.some((component) => component.kind === 'util' && component.name === 'reset'))

  const listed = listComponents(catalog, { kind: 'style-component', limit: 100 })
  assert.equal(listed.length, styleComponents.length)
})

test('components expose the kth class selectors declared by their stylesheet', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)

  const header = catalog.components.find(
    (component) => component.kind === 'style-component' && component.name === 'header'
  )
  assert.ok(header)
  assert.ok(header.classes.includes('kth-header'))

  const tabs = catalog.components.find(
    (component) => component.kind === 'style-component' && component.name === 'tabs'
  )
  assert.deepEqual(tabs?.classes, ['kth-tabs'])
})

test('every reported entrypoint resolves to a file that exists', async () => {
  for (const sourceDir of [fixtureSourceDir, fixtureStylePackageDir]) {
    const catalog = await buildCatalog(sourceDir)
    for (const entrypoint of catalog.entrypoints) {
      assert.ok(
        existsSync(path.join(catalog.sourceDir, entrypoint.relativePath)),
        `entrypoint ${entrypoint.name} points at missing file ${entrypoint.relativePath}`
      )
    }
  }
})

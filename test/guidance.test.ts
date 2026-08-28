import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { buildCatalog } from '../src/catalog.js'
import { getComponentGuidance, getHeaderRecipe, getPageScaffold, suggestThemeStructure, GUIDED_COMPONENTS } from '../src/guidance.js'

const fixtureSourceDir = path.resolve('test/fixtures/style')
const guidanceFixtureSourceDir = fixtureSourceDir

test('suggestThemeStructure and getHeaderRecipe expose style-specific theme and dialog wiring', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)

  const structure = suggestThemeStructure(catalog, 'intranet')
  assert.ok(structure.integrationNotes.some((note) => note.includes('localNavigation.ts')))
  assert.ok(structure.recommendedTokens.some((token) => token.name === 'theme-intranet.color-primary'))

  const headerRecipe = getHeaderRecipe(catalog, 'student-web')
  assert.ok(headerRecipe.activationClasses.includes('student-web'))
  assert.equal(headerRecipe.semanticContext, 'student-web')
  assert.ok(headerRecipe.requiredImports.includes('@kth/style/scss/components/header'))
  assert.ok(headerRecipe.requiredImports.includes('@kth/style/scss/components/logotype'))
  assert.ok(headerRecipe.requiredImports.includes('@kth/style/scss/components/button'))
  assert.ok(headerRecipe.domStructure.some((node) => node.tag === 'header' && node.classes.includes('kth-header')))
  assert.ok(headerRecipe.domStructure.some((node) => node.classes.includes('kth-header__container') && node.required))
  assert.ok(headerRecipe.scriptHooks.some((hook) => hook.call.includes('MenuPanel.initModals')))
  assert.ok(headerRecipe.requiredDomHooks.some((hook) => hook.name === 'mobileMenuList'))
  assert.ok(headerRecipe.requiredDomHooks.some((hook) => hook.name === 'data-id' && hook.selectorType === 'attribute'))
})

test('external header guidance uses external class with inverse package tokens', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)
  const headerRecipe = getHeaderRecipe(catalog, 'external')

  assert.deepEqual(headerRecipe.activationClasses, ['external'])
  assert.equal(headerRecipe.themeTokenPrefix, 'theme-inverse')
  assert.equal(headerRecipe.semanticContext, 'inverse')
  assert.ok(headerRecipe.tokens.some((token) => token.name === 'theme-inverse.color-header'))
  assert.ok(headerRecipe.domStructure.some((node) => node.tag === 'header' && node.classes.includes('external')))
  assert.ok(headerRecipe.integrationNotes.some((note) => note.includes('context "inverse"') && note.includes('header class "external"')))
})

test('page scaffold and component guidance map to the style package model', async () => {
  const catalog = await buildCatalog(fixtureSourceDir)

  const scaffold = getPageScaffold(catalog, 'student-web')
  assert.ok(scaffold.sections.some((section) => section.name === 'translation-panel'))

  const buttonGuidance = getComponentGuidance(catalog, 'button')
  assert.ok(buttonGuidance.components.some((component) => component.name === 'button'))
  assert.ok(buttonGuidance.components.some((component) => component.name === 'Button'))

  const alertGuidance = getComponentGuidance(catalog, 'alert')
  assert.ok(alertGuidance.icons.some((icon) => icon.name === 'info-500'))

  const navigationGuidance = getComponentGuidance(catalog, 'navigation', 'public')
  assert.ok(navigationGuidance.behaviorScripts.some((script) => script.name === 'menu-panel-script'))
  assert.ok(navigationGuidance.icons.some((icon) => icon.name === 'menu'))
})

test('every guided component resolves to package-backed data', async () => {
  const catalog = await buildCatalog(guidanceFixtureSourceDir)

  for (const component of GUIDED_COMPONENTS) {
    const guidance = getComponentGuidance(catalog, component)

    assert.ok(guidance.components.length > 0, `${component} returned no components`)
    assert.ok(guidance.notes.length > 0, `${component} returned no notes`)
    for (const entry of guidance.components) {
      assert.ok(
        catalog.components.includes(entry),
        `${component} returned an entry that is not in the catalog`
      )
    }
  }
})

test('guidance for a component without a bespoke entry is derived from its stylesheet', async () => {
  const catalog = await buildCatalog(guidanceFixtureSourceDir)
  const guidance = getComponentGuidance(catalog, 'tabs')

  assert.equal(guidance.components[0]?.name, 'tabs')
  assert.deepEqual(
    guidance.domHooks.map((hook) => hook.name),
    ['kth-tabs']
  )
  assert.ok(guidance.mixins.some((mixin) => mixin.name === 'horizontal-list'))
  assert.ok(guidance.notes.some((note) => note.includes('@use')))
})

test('behaviour aliases map onto the components that implement them', async () => {
  const catalog = await buildCatalog(guidanceFixtureSourceDir)

  for (const alias of ['navigation', 'modal'] as const) {
    const guidance = getComponentGuidance(catalog, alias)
    assert.equal(guidance.component, alias)
    assert.ok(guidance.components.length > 0, `${alias} returned no components`)
  }
})

test('React wrapper claims are dropped when @kth/ui-components is absent', async (t) => {
  // The installed package is a bare @kth/style with no sibling ui-components,
  // which is exactly the layout the Docker image runs against.
  const installedDir = path.resolve('node_modules/@kth/style')
  if (!existsSync(installedDir)) {
    t.skip('installed @kth/style not present')
    return
  }

  const withoutReact = await buildCatalog(installedDir)
  const guidance = getComponentGuidance(withoutReact, 'alert')

  assert.equal(withoutReact.uiComponentsDir, null)
  assert.ok(guidance.notes.some((note) => note.includes('not available')))
  assert.ok(!guidance.notes.some((note) => note.includes('Alert.tsx')))
})

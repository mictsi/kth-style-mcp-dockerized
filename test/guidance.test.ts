import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { buildCatalog } from '../src/catalog.js'
import { getComponentGuidance, getHeaderRecipe, getPageScaffold, suggestThemeStructure } from '../src/guidance.js'

const fixtureSourceDir = path.resolve('test/fixtures/style')

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

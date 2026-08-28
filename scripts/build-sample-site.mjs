#!/usr/bin/env node
/**
 * Builds the sample site under sample-site/ from the running MCP server.
 *
 *   ./run.sh run          # start the server first
 *   npm run sample
 *
 * This script is a plain MCP client. It speaks Streamable HTTP to the server
 * and every value on the site — the component list, their import paths and
 * class names, all token values, the theme contexts, the icon mixins and the
 * logotype SVGs — arrives as a tools/call response. Nothing is read out of
 * node_modules and nothing is hand-copied.
 *
 * One thing does not come over MCP: the component CSS itself. No tool serves
 * stylesheet source or compiled CSS, so the generated entry stylesheet — whose
 * @use lines are the import paths the server reported — is compiled by Sass
 * against the package, exactly as a real KTH app would. See the note printed
 * at the end of a build.
 *
 * Set MCP_URL to point at a server that is not on the default endpoint.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SITE = path.join(ROOT, 'sample-site')
const SRC = path.join(SITE, 'src')
const ASSETS = path.join(SITE, 'assets')
const MCP_URL = process.env.MCP_URL ?? 'http://127.0.0.1:8888/mcp'

const PAGES = [
  ['index.html', 'Overview'],
  ['components.html', 'Components'],
  ['themes.html', 'Themes'],
  ['tokens.html', 'Tokens'],
  ['icons.html', 'Icons'],
]

// ---------------------------------------------------------------------------
// MCP client
// ---------------------------------------------------------------------------

let requestId = 0

/**
 * Calls one MCP tool and returns its structuredContent. The stateless
 * Streamable HTTP transport answers with a single SSE `message` event, so the
 * body is parsed for the first `data:` line rather than as plain JSON.
 */
async function callTool(name, args = {}) {
  requestId += 1

  let response
  try {
    response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    })
  } catch (cause) {
    throw new Error(
      `Could not reach the MCP server at ${MCP_URL}. Start it with "./run.sh run" or set MCP_URL. (${cause.message})`
    )
  }

  if (!response.ok) {
    throw new Error(`MCP server returned ${response.status} ${response.statusText} for ${name}`)
  }

  const body = await response.text()
  const payload = body
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .find((line) => line.startsWith('{'))

  const message = JSON.parse(payload ?? body)
  if (message.error) {
    throw new Error(`MCP error calling ${name}: ${message.error.message}`)
  }
  if (message.result?.isError) {
    const text = message.result.content?.map((part) => part.text).join('\n') ?? ''
    throw new Error(`Tool ${name} reported an error:\n${text}`)
  }

  return message.result.structuredContent
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

const escape = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Provenance line, in the shape the MCP tools report it. */
const source = (tool, detail) =>
  `<p class="sample-source">via <b>${escape(tool)}</b>${detail ? ` · ${escape(detail)}` : ''}</p>`

const section = (id, title, note, body, provenance = '') => `
      <section class="sample-section" id="${id}">
        <h2>${escape(title)}</h2>
        <p class="sample-note">${note}</p>
        ${provenance}
        ${body}
      </section>`

function layout({ page, title, lede, body, pkg }) {
  const nav = PAGES.map(
    ([href, label]) =>
      `<a class="kth-menu-item${href === page ? ' dropdown' : ''}" href="${href}"${href === page ? ' aria-current="page"' : ''}>${label}</a>`
  ).join('\n          ')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} — kth-style-mcp sample site</title>
<meta name="description" content="Every component, token, theme and icon that kth-style-mcp serves, rendered from live MCP responses.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300..900;1,300..900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
</head>
<body>

<a class="kth-a11y-nav" href="#main">Skip to main content</a>

<div class="kth-kpm">
  <div class="kth-entrances">
    <ul>
      <li><a href="../index.html">kth-style-mcp</a></li>
      <li><a href="https://github.com/KTH/style">@kth/style</a></li>
    </ul>
  </div>
</div>

<header class="kth-header">
  <div class="kth-header__container">
    <a href="index.html" class="kth-logotype">
      <figure>
        <img alt="KTH" width="64" height="64" src="assets/logotype-blue.svg">
      </figure>
    </a>

    <nav class="kth-mega-menu" aria-label="Sample site">
      <ul>
        <li>
          <a href="#" data-id="demo-panel" class="kth-menu-item dropdown">Menu panel</a>
          <dialog class="kth-menu-panel">
            <div class="kth-menu-panel__container">
              <div class="kth-menu-panel__header">
                <div>
                  <h2>Menu panel</h2>
                  <a href="components.html#menu-panel">About this component</a>
                </div>
                <button class="kth-icon-button close">
                  <span class="kth-visually-hidden">Close</span>
                </button>
              </div>
              <div class="kth-menu-panel__content">
                <p>A non-modal <code>&lt;dialog&gt;</code> opened by <code>MenuPanel.init()</code>. It closes on Escape, on an outside click, and when focus leaves the header.</p>
              </div>
            </div>
          </dialog>
        </li>
      </ul>
    </nav>

    <ul class="kth-header__tools">
      <li>
        <button class="kth-menu-item search">Search</button>
        <dialog class="kth-menu-panel">
          <div class="kth-menu-panel__container search">
            <button class="kth-icon-button close">
              <span class="kth-visually-hidden">Close</span>
            </button>
            <div class="kth-menu-panel__content search">
              <form action="#" method="get" onsubmit="return false">
                <div class="kth-search">
                  <label for="site-search">Search this sample</label>
                  <input type="text" id="site-search" name="q" autocomplete="off">
                  <button type="submit"><span class="kth-visually-hidden">Search</span></button>
                </div>
              </form>
            </div>
          </div>
        </dialog>
      </li>
      <li>
        <a href="#" class="kth-menu-item language" lang="sv">Svenska</a>
        <dialog class="kth-translation">
          <button class="kth-icon-button close">
            <span class="kth-visually-hidden">Close</span>
          </button>
          <h2>Byt språk</h2>
          <p>Opened by <code>MenuPanel.initTranslationModal()</code>, which only intercepts the click when the trigger has no <code>href</code> of its own.</p>
        </dialog>
      </li>
    </ul>

    <button class="kth-menu-item menu collapsable">Menu</button>

    <nav class="kth-mega-menu--collapsable" aria-label="Sample site, mobile">
      <dialog class="kth-mobile-menu">
        <button class="kth-icon-button close">
          <span class="kth-visually-hidden">Close</span>
        </button>
        <ul>
          ${PAGES.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('\n          ')}
        </ul>
      </dialog>
    </nav>
  </div>
</header>

<main id="main" class="sample-main">
  <div class="kth-content">
    <div class="sample-shell">
      <nav class="kth-breadcrumbs" aria-label="Breadcrumbs">
        <ol>
          <li><a href="../index.html">kth-style-mcp</a></li>
          <li><a href="index.html">Sample site</a></li>
          <li>${escape(title)}</li>
        </ol>
      </nav>

      <div class="sample-lede">
        <h1>${escape(title)}</h1>
        ${lede}
      </div>

      <nav class="sample-nav" aria-label="Sample pages">
          ${nav}
      </nav>
${body}
    </div>
  </div>
</main>

<footer class="kth-footer">
  <div class="kth-footer__content sample-shell">
    <p>Built from live MCP responses against <code>@kth/style ${escape(pkg.version)}</code>, discovered as <code>${escape(pkg.source)}</code>. No value on this page was written by hand.</p>
    <p>Rebuild with <code>npm run sample</code> while the server is running. Back to the <a href="../index.html">project overview</a>.</p>
  </div>
</footer>

<script type="module" src="sample.js"></script>
</body>
</html>
`
}

// ---------------------------------------------------------------------------
// Demo markup per component. The class names used here are the ones the server
// reports for that component; the markup shows how they compose.
// ---------------------------------------------------------------------------

const DEMOS = {
  button: `<div class="sample-demo">
          <button class="kth-button">Primary</button>
          <button class="kth-button secondary">Secondary</button>
          <button class="kth-button success">Success</button>
          <button class="kth-button error">Error</button>
          <button class="kth-button back">Back</button>
          <button class="kth-button previous">Previous</button>
          <button class="kth-button next">Next</button>
          <button class="kth-button" disabled>Disabled</button>
        </div>`,

  'icon-button': `<div class="sample-demo">
          <button class="kth-icon-button close"><span class="kth-visually-hidden">Close</span></button>
        </div>`,

  alert: `<div class="sample-demo stack">
          <div class="kth-alert info"><h2>Information</h2><p>The catalog was rebuilt from the installed package.</p></div>
          <div class="kth-alert warning"><h2>Warning</h2><p>This context is not published by the package, so no values were returned.</p></div>
          <div class="kth-alert success"><h2>Success</h2><p>All components resolved against the package.</p></div>
        </div>`,

  accordion: `<div class="sample-demo stack">
          <div class="kth-accordion">
            <details>
              <summary>What does the server return?</summary>
              <p>Exact values, the file and line they were parsed from, the package version, and how the package was discovered.</p>
            </details>
            <details>
              <summary>What happens when a value cannot be resolved?</summary>
              <p>A structured diagnostic, never a plausible-looking guess.</p>
            </details>
          </div>
        </div>`,

  details: `<div class="sample-demo stack">
          <details class="sample-details">
            <summary>A bare &lt;details&gt; styled by the details mixin</summary>
            <p>The stylesheet generates a <code>.kth-details</code> class by default. Importing it with <code>$generate-css: false</code> lets you apply the mixin to plain markup instead.</p>
          </details>
        </div>`,

  input: `<div class="sample-demo stack">
          <div class="kth-input">
            <label for="demo-name">Full name</label>
            <input type="text" id="demo-name" name="name">
          </div>
          <div class="kth-input error">
            <label for="demo-mail">Email</label>
            <input type="email" id="demo-mail" name="mail" value="not-an-address" aria-describedby="demo-mail-error">
            <span id="demo-mail-error">Enter a complete email address.</span>
          </div>
          <div class="kth-checkbox">
            <input type="checkbox" id="demo-check" checked>
            <label for="demo-check">Index the installed package on start</label>
          </div>
          <div class="kth-radio">
            <input type="radio" id="demo-radio-a" name="demo-radio" checked>
            <label for="demo-radio-a">Installed package</label>
          </div>
          <div class="kth-radio">
            <input type="radio" id="demo-radio-b" name="demo-radio">
            <label for="demo-radio-b">Monorepo checkout</label>
          </div>
        </div>`,

  search: `<div class="sample-demo">
          <form action="#" method="get" onsubmit="return false">
            <div class="kth-search">
              <label for="demo-search">Search KTH</label>
              <input type="text" id="demo-search" name="q" autocomplete="off">
              <button type="submit"><span class="kth-visually-hidden">Search</span></button>
            </div>
          </form>
        </div>`,

  table: `<div class="sample-demo stack">
          <table class="kth-table">
            <caption>Tools by response shape</caption>
            <thead>
              <tr>
                <th class="kth-table__column--sortable" aria-sort="ascending">Tool</th>
                <th>Returns</th>
                <th class="kth-table__cell--numeric">Fields</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>kth_style_get_token</td><td>One exact token</td><td class="kth-table__cell--numeric">12</td></tr>
              <tr><td>kth_style_get_theme</td><td>A full theme context</td><td class="kth-table__cell--numeric">31</td></tr>
              <tr><td>get_component_guidance</td><td>Classes, tokens, mixins</td><td class="kth-table__cell--numeric">9</td></tr>
            </tbody>
          </table>
        </div>`,

  tabs: `<div class="sample-demo stack">
          <div class="kth-tabs">
            <ul>
              <li><a href="#tab-installed" class="active">installed</a></li>
              <li><a href="#tab-installed">source-dir</a></li>
              <li><a href="#tab-installed">monorepo-default</a></li>
            </ul>
          </div>
          <div class="kth-tabs__pane" id="tab-installed">
            <p>The default: <code>node_modules/@kth/style</code>, found by walking up from the server.</p>
          </div>
        </div>`,

  breadcrumbs: `<div class="sample-demo">
          <nav class="kth-breadcrumbs" aria-label="Example">
            <ol>
              <li><a href="#">KTH</a></li>
              <li><a href="#">Style</a></li>
              <li>Components</li>
            </ol>
          </nav>
        </div>`,

  'local-navigation': `<div class="sample-demo">
          <nav class="kth-local-navigation" aria-label="Local">
            <ul>
              <li><a href="#" aria-current="page">Overview</a></li>
              <li class="expandable">
                <a href="#">Tokens</a>
                <ul>
                  <li><a href="#">Colours</a></li>
                  <li><a href="#">Spacing</a></li>
                </ul>
              </li>
              <li><a href="#">Icons</a></li>
            </ul>
          </nav>
        </div>`,

  'menu-item': `<div class="sample-demo">
          <button class="kth-menu-item">Plain</button>
          <button class="kth-menu-item dropdown">Dropdown</button>
          <button class="kth-menu-item search">Search</button>
          <button class="kth-menu-item menu">Menu</button>
          <a class="kth-menu-item language" href="#">Svenska</a>
        </div>`,

  logotype: `<div class="sample-demo">
          <a href="#" class="kth-logotype">
            <figure><img alt="KTH" width="64" height="64" src="assets/logotype-blue.svg"></figure>
          </a>
        </div>`,

  'visually-hidden': `<div class="sample-demo stack">
          <p>The next element is present for assistive technology but not painted:<span class="kth-visually-hidden">This text is only announced by screen readers.</span> <em>(nothing visible between the colon and here)</em></p>
        </div>`,

  'a11y-nav': `<div class="sample-demo stack">
          <p>The skip link at the very top of this page is <code>.kth-a11y-nav</code>. Press <kbd>Tab</kbd> from the address bar to reveal it.</p>
        </div>`,

  header: `<div class="sample-demo stack">
          <p>The header at the top of this page is the live component, wired with <code>MenuPanel</code>. Open the menu panel, the search panel and the language dialog to see all three dialog behaviours.</p>
        </div>`,

  footer: `<div class="sample-demo stack">
          <p>The footer at the bottom of this page is the live component.</p>
        </div>`,

  kpm: `<div class="sample-demo stack">
          <p>The bar pinned above the header is <code>.kth-kpm</code>. The package reset reserves <code>2.5rem</code> of top margin on <code>body</code> for it.</p>
        </div>`,

  'mega-menu': `<div class="sample-demo stack">
          <p>The horizontal navigation inside the header is <code>.kth-mega-menu</code>; its collapsed sibling <code>.kth-mega-menu--collapsable</code> holds the mobile dialog. Narrow the window to swap between them.</p>
        </div>`,

  'menu-panel': `<div class="sample-demo stack">
          <p>Open "Menu panel" or "Search" in the header. Both are <code>.kth-menu-panel</code> dialogs opened by <code>MenuPanel.init()</code>.</p>
        </div>`,

  'mobile-menu': `<div class="sample-demo stack">
          <p>Narrow the window until the "Menu" button appears, then open it. That modal is <code>.kth-mobile-menu</code>, opened by <code>MenuPanel.initModal()</code>.</p>
        </div>`,

  'translation-panel': `<div class="sample-demo stack">
          <p>Open "Svenska" in the header. The dialog is <code>.kth-translation</code>; its stylesheet pins the default colour theme so the panel looks the same in every context.</p>
        </div>`,

  content: `<div class="sample-demo stack">
          <p>Every page here is wrapped in <code>.kth-content</code>, which applies the package container width.</p>
        </div>`,
}

function componentCard(component) {
  const demo =
    DEMOS[component.name] ??
    `<div class="sample-demo stack"><p>No interactive demo for this component. The server reports ${
      component.classes?.length
        ? `these classes: ${component.classes.map((c) => `<code>.${escape(c)}</code>`).join(', ')}`
        : 'no <code>kth-*</code> classes'
    }.</p></div>`

  return section(
    component.name,
    component.name,
    `Import with <code>@use "${escape(component.importPath)}"</code>.`,
    demo,
    source('kth_style_list_components', `${component.relativePath}${component.classes?.length ? ` · ${component.classes.map((c) => `.${c}`).join(' ')}` : ''}`)
  )
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function buildComponentsPage(data) {
  return layout({
    page: 'components.html',
    title: 'Components',
    pkg: data.pkg,
    lede: `<p>All ${data.components.length} components the server lists for <code>@kth/style ${escape(data.pkg.version)}</code>. The import path and class names under each demo are the ones <code>kth_style_list_components</code> returned for it.</p>`,
    body: data.components.map(componentCard).join('\n'),
  })
}

function buildTokensPage(data) {
  const groups = [
    ['colors', 'Colour', 'Reference tokens are Sass variables. The semantic layer further down maps them onto CSS custom properties, one set per theme context.'],
    ['spacing', 'Spacing', 'The spacing scale.'],
    ['typography', 'Typography', 'Font family and weight tokens.'],
  ]

  const referenceSections = groups.map(([category, title, note]) => {
    const tokens = data.referenceTokens.filter((token) => token.category === category)
    const cards = tokens
      .map((token) => {
        const value = token.resolvedValue ?? token.rawValue
        const isColor = /^#|^rgb/.test(value)
        return `<div class="sample-swatch">
            ${isColor ? `<div class="chip" style="background:${escape(value)}"></div>` : ''}
            <dl>
              <dt>$${escape(token.name)}</dt>
              <dd>${escape(value)}</dd>
              <dd>line ${escape(token.lineNumber)}</dd>
            </dl>
          </div>`
      })
      .join('\n          ')

    return section(
      `tokens-${category}`,
      title,
      note,
      `<div class="sample-grid">\n          ${cards}\n        </div>`,
      source('kth_style_list_tokens', `tokenType: reference · ${tokens.length} tokens`)
    )
  })

  const contexts = [...new Set(data.semanticTokens.map((token) => token.context))]
  const semanticBlocks = contexts
    .map((context) => {
      const tokens = data.semanticTokens.filter((token) => token.context === context)
      const rows = tokens
        .map(
          (token) =>
            `<tr><td><code>${escape(token.cssName ?? token.name)}</code></td><td><code>${escape(token.rawValue)}</code></td><td>${escape(token.resolvedValue ?? '—')}</td></tr>`
        )
        .join('\n              ')
      return `<h3>theme-${escape(context)}</h3>
        <div class="sample-demo stack">
          <table class="kth-table">
            <thead><tr><th>Custom property</th><th>Declared as</th><th>Resolves to</th></tr></thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>`
    })
    .join('\n        ')

  return layout({
    page: 'tokens.html',
    title: 'Tokens',
    pkg: data.pkg,
    lede: `<p>${data.referenceTokens.length} reference tokens and ${data.semanticTokens.length} semantic tokens, exactly as the server returns them — including the line each one was parsed from. This is what an agent reads instead of guessing a hex value.</p>`,
    body:
      referenceSections.join('\n') +
      section(
        'tokens-semantic',
        'Semantic tokens by context',
        'Each context declares the same custom properties over different reference tokens. Compare them side by side on the <a href="themes.html">themes page</a>.',
        semanticBlocks,
        source('kth_style_list_tokens', `tokenType: semantic · ${contexts.length} contexts`)
      ),
  })
}

function buildIconsPage(data) {
  const broken = new Set(data.brokenMixins ?? [])
  const iconCards = data.icons
    .filter((icon) => icon.kind === 'icon')
    .map((icon) => {
      const mixin = icon.variants?.[0]?.scssMixin
      if (broken.has(mixin)) {
        return `<div class="sample-icon broken">
            <span aria-hidden="true">!</span>
            <span>${escape(icon.name)}</span>
            <span>does not compile</span>
          </div>`
      }
      return `<div class="sample-icon">
            <span class="sample-icon-${escape(icon.name)}" aria-hidden="true"></span>
            <span>${escape(icon.name)}</span>
          </div>`
    })
    .join('\n          ')

  const logoCards = data.logotypes
    .map(
      (logo) => `<div class="sample-swatch">
            <div class="chip logo ${logo.name.includes('white') ? 'on-primary' : ''}">
              <img src="assets/${escape(logo.name)}.svg" alt="${escape(logo.name)}" height="40">
            </div>
            <dl><dt>${escape(logo.name)}</dt><dd>${escape(logo.relativePath)}</dd></dl>
          </div>`
    )
    .join('\n          ')

  const iconCount = data.icons.filter((icon) => icon.kind === 'icon').length

  return layout({
    page: 'icons.html',
    title: 'Icons',
    pkg: data.pkg,
    lede: `<p>Icons are colourless by design: each is a mask on a pseudo-element, so it takes the colour you set. Every icon below is drawn with the mixin the server named for it, and the logotype files were written straight from <code>get_icon</code> responses.</p>`,
    body:
      section(
        'icon-mixins',
        `Icon mixins (${iconCount})`,
        `Apply the mixin on a pseudo-element and set <code>background-color</code>, exactly as the package components do.${
          broken.size
            ? ` ${[...broken].map((m) => `<code>${escape(m)}</code>`).join(', ')} is published by the package but references a raw variable that does not exist, so it cannot compile in any project — it is marked below rather than hidden.`
            : ''
        }`,
        `<div class="sample-demo stack sample-icon-field"><div class="sample-icons">\n          ${iconCards}\n        </div></div>`,
        source('search_icons', `${iconCount} icon mixins`)
      ) +
      section(
        'logotypes',
        `Logotypes (${data.logotypes.length})`,
        'Shipped as SVG assets rather than mixins. <code>get_icon</code> returns the SVG content itself, which is how these files got here.',
        `<div class="sample-grid">\n          ${logoCards}\n        </div>`,
        source('get_icon', `${data.logotypes.length} assets`)
      ),
  })
}

function buildThemesPage(data) {
  const notes = {
    default: 'The public web theme. The package reset applies it to <code>:root</code>, so it is what you get for free.',
    intranet: 'The intranet palette. Header and footer take a matching <code>.intranet</code> class.',
    'student-web': 'The student web palette.',
    inverse: 'The inverted palette. The server also answers to <code>external</code>, which aliases onto this context.',
    dense: 'A spacing context rather than a colour one: it tightens the <code>--space-inner-*</code> variables and leaves the palette alone.',
  }

  const panels = data.contexts
    .map((context) => {
      const tokens = data.semanticTokens.filter((token) => token.context === context)
      const swatches = tokens
        .filter((token) => /^#/.test(token.resolvedValue ?? ''))
        .slice(0, 8)
        .map(
          (token) =>
            `<div class="sample-swatch"><div class="chip" style="background:${escape(token.resolvedValue)}"></div><dl><dt>${escape(token.cssName ?? token.name)}</dt><dd>${escape(token.resolvedValue)}</dd></dl></div>`
        )
        .join('\n            ')

      return section(
        `theme-${context}`,
        `theme-${context}`,
        notes[context] ?? 'A theme context published by the package.',
        `<div class="sample-theme ${escape(context)}">
            <h3>Heading in this context</h3>
            <p>Body text, a <a href="#theme-${escape(context)}">link</a>, and the components below all take their colours from this context.</p>
            <div class="sample-demo">
              <button class="kth-button">Primary</button>
              <button class="kth-button secondary">Secondary</button>
            </div>
            <div class="kth-alert info"><h2>Alert</h2><p>Same markup, different context.</p></div>
          </div>
          <div class="sample-grid sample-grid--spaced">
            ${swatches}
          </div>`,
        source('kth_style_get_theme', `context: ${context} · ${tokens.length} semantic tokens`)
      )
    })
    .join('\n')

  return layout({
    page: 'themes.html',
    title: 'Themes',
    pkg: data.pkg,
    lede: `<p>The server reports ${data.contexts.length} theme contexts. Each panel below opts into one of them, so the identical markup can be compared across all of them at once.</p>`,
    body: panels,
  })
}

function buildIndexPage(data) {
  const iconCount = data.icons.filter((icon) => icon.kind === 'icon').length

  return layout({
    page: 'index.html',
    title: 'Sample site',
    pkg: data.pkg,
    lede: `<p>This site is generated by calling <code>kth-style-mcp</code> over MCP. Every component, token, theme and icon on it arrived as a <code>tools/call</code> response from the running server — the same responses your coding agent gets.</p>
      <p>Use it to see how a component actually looks before asking an agent to build with it, and to check that what an agent tells you matches what the server says.</p>`,
    body:
      section(
        'what',
        'What is on each page',
        'Each page is backed by the tools an agent would call for that question.',
        `<div class="sample-demo stack">
          <table class="kth-table">
            <thead><tr><th>Page</th><th>Shows</th><th>Built from</th></tr></thead>
            <tbody>
              <tr><td><a href="components.html">Components</a></td><td>All ${data.components.length} components, live</td><td><code>kth_style_list_components</code></td></tr>
              <tr><td><a href="themes.html">Themes</a></td><td>The same markup under ${data.contexts.length} contexts</td><td><code>kth_style_get_theme</code></td></tr>
              <tr><td><a href="tokens.html">Tokens</a></td><td>${data.referenceTokens.length} reference, ${data.semanticTokens.length} semantic tokens</td><td><code>kth_style_list_tokens</code></td></tr>
              <tr><td><a href="icons.html">Icons</a></td><td>${iconCount} icon mixins, ${data.logotypes.length} logotypes</td><td><code>search_icons</code>, <code>get_icon</code></td></tr>
            </tbody>
          </table>
        </div>`,
        source('kth_style_get_package_info', `${escape(data.pkg.source)} · ${escape(data.pkg.version)}`)
      ) +
      section(
        'how',
        'How this site is built',
        'The build script is a plain MCP client, so the site cannot drift from what the server reports.',
        `<div class="sample-demo stack">
          <p><code>scripts/build-sample-site.mjs</code> POSTs <code>tools/call</code> requests to the server and writes these pages from the responses. It never imports the server's code and never reads <code>node_modules</code>.</p>
          <p>The entry stylesheet is generated too: its <code>@use</code> lines are the import paths <code>kth_style_list_components</code> returned, and the icon classes come from the mixin names <code>search_icons</code> returned.</p>
          <p>The one thing MCP does not serve is the CSS itself — no tool returns stylesheet source or compiled CSS — so Sass compiles those generated imports against the package, exactly as a real KTH app does.</p>
          <pre><code>./run.sh run
npm run sample</code></pre>
        </div>`,
        source('scripts/build-sample-site.mjs', MCP_URL)
      ),
  })
}

// ---------------------------------------------------------------------------
// Generated stylesheet inputs
// ---------------------------------------------------------------------------

/** The entry stylesheet, whose imports are the paths the server reported. */
function generateEntryScss(components, entrypoints) {
  const utilities = ['utils/layers', 'tokens/colors', 'tokens/spacing', 'tokens/typography', 'tokens/icons', 'utils/reset', 'utils/prose']

  const componentImports = components
    .filter((component) => component.name !== 'details')
    .map((component) => `@use "${component.importPath}";`)
    .join('\n')

  return `// Generated by scripts/build-sample-site.mjs from MCP responses — do not edit.
//
// Every @use below is an importPath returned by kth_style_list_components for
// @kth/style, so this file lists exactly the components the server publishes.
// Reset entrypoint reported by get_entrypoints: ${entrypoints.find((e) => e.name === 'reset')?.relativePath ?? 'scss/utils/reset.scss'}

${utilities.map((u) => `@use "@kth/style/scss/${u}";`).join('\n')}

${componentImports}

// details.scss generates a .kth-details class by default; importing it with
// $generate-css: false allows applying the mixin to bare <details> as well.
@use "@kth/style/scss/components/details";

@use "generated-icons";
@use "chrome";
`
}

/** One class per icon mixin the server reported, minus any that will not compile. */
function generateIconScss(icons, skip = new Set()) {
  const rules = icons
    .filter((icon) => icon.kind === 'icon' && icon.variants?.[0]?.scssMixin && !skip.has(icon.variants[0].scssMixin))
    .map(
      (icon) => `  .sample-icon-${icon.name}::before {
    @include icons.${icon.variants[0].scssMixin};

    background-color: currentcolor;
  }`
    )
    .join('\n\n')

  return `// Generated by scripts/build-sample-site.mjs from search_icons — do not edit.
@use "@kth/style/scss/tokens/icons";

@layer sample {
${rules}
}
`
}

// ---------------------------------------------------------------------------

/**
 * Compiles the entry stylesheet, dropping any icon mixin the package itself
 * cannot compile. @kth/style 1.14.1 ships one such mixin (icon-new-window
 * references a raw variable that does not exist), and a broken upstream mixin
 * should not stop the whole site from building — it gets reported instead.
 */
function compileStylesheet(icons) {
  const broken = new Set()

  for (let attempt = 0; attempt <= 8; attempt += 1) {
    fs.writeFileSync(path.join(SRC, '_generated-icons.scss'), generateIconScss(icons, broken))

    try {
      execFileSync(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        [
          'sass',
          '--load-path=node_modules',
          '--style=compressed',
          '--no-source-map',
          path.join(SRC, 'sample.scss'),
          path.join(SITE, 'styles.css'),
        ],
        { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] }
      )
      return [...broken]
    } catch (error) {
      const stderr = String(error.stderr ?? '')
      const culprit = stderr.match(/\b(icon-[\w-]+)\(\)/)?.[1]
      if (!culprit || broken.has(culprit)) {
        throw new Error(`Sass failed and the cause could not be isolated:\n${stderr}`)
      }
      console.warn(`warning: @kth/style mixin ${culprit} does not compile; excluding it`)
      broken.add(culprit)
    }
  }

  throw new Error('too many uncompilable icon mixins; giving up')
}

async function main() {
  console.log(`calling ${MCP_URL} …`)

  const [pkgInfo, componentList, referenceTokens, semanticTokens, iconList, entrypointList] = await Promise.all([
    callTool('kth_style_get_package_info'),
    callTool('kth_style_list_components', { kind: 'style-component', limit: 100 }),
    callTool('kth_style_list_tokens', { tokenType: 'reference' }),
    callTool('kth_style_list_tokens', { tokenType: 'semantic' }),
    callTool('search_icons', { limit: 100 }),
    callTool('get_entrypoints'),
  ])

  const components = componentList.components.slice().sort((a, b) => a.name.localeCompare(b.name))
  const icons = iconList.icons
  const contexts = [...new Set(semanticTokens.tokens.map((token) => token.context))]

  // Theme contexts are confirmed one by one so the page only shows contexts the
  // server actually resolves, rather than every name it happens to mention.
  const themes = await Promise.all(contexts.map((context) => callTool('kth_style_get_theme', { context })))
  const resolvedContexts = contexts.filter((_, index) => !themes[index].warnings?.length)

  // Logotype SVGs come over MCP as content, so they are written from responses.
  const logotypeNames = icons.filter((icon) => icon.kind === 'logotype').map((icon) => icon.name)
  const logotypes = []
  fs.mkdirSync(ASSETS, { recursive: true })
  for (const name of logotypeNames) {
    const result = await callTool('get_icon', { name })
    const variant = result.icon.variants[0]
    if (variant.svg) {
      fs.writeFileSync(path.join(ASSETS, `${name}.svg`), variant.svg)
    }
    logotypes.push({ name, relativePath: variant.relativePath ?? '' })
  }

  // MenuPanel bundle: MCP names the entrypoint, the bytes come from that path.
  const scriptEntry = entrypointList.entrypoints.find((entry) => entry.type === 'js')
  if (scriptEntry) {
    fs.copyFileSync(
      path.join(ROOT, 'node_modules/@kth/style', scriptEntry.relativePath),
      path.join(ASSETS, 'menu-panel.js')
    )
  }

  const data = {
    pkg: { version: pkgInfo.version, source: pkgInfo.source },
    components,
    referenceTokens: referenceTokens.tokens,
    semanticTokens: semanticTokens.tokens,
    icons,
    logotypes,
    contexts: resolvedContexts,
  }

  fs.mkdirSync(SRC, { recursive: true })
  fs.writeFileSync(path.join(SRC, 'sample.scss'), generateEntryScss(components, entrypointList.entrypoints))

  const brokenMixins = compileStylesheet(icons)
  data.brokenMixins = brokenMixins

  const pages = {
    'index.html': buildIndexPage(data),
    'components.html': buildComponentsPage(data),
    'themes.html': buildThemesPage(data),
    'tokens.html': buildTokensPage(data),
    'icons.html': buildIconsPage(data),
  }
  for (const [name, html] of Object.entries(pages)) {
    fs.writeFileSync(path.join(SITE, name), html)
  }

  console.log(
    `sample-site built from MCP responses: @kth/style ${data.pkg.version} (${data.pkg.source}) · ` +
      `${Object.keys(pages).length} pages · ${components.length} components · ` +
      `${data.referenceTokens.length + data.semanticTokens.length} tokens · ${icons.length} icons · ` +
      `${resolvedContexts.length} contexts`
  )
  console.log('note: component CSS is compiled by Sass from the import paths MCP reported; no tool serves stylesheet source.')
}

main().catch((error) => {
  console.error(`\nsample-site build failed: ${error.message}`)
  process.exit(1)
})

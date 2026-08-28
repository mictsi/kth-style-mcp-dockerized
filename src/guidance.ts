import { getIcon, getToken, type Catalog, type Component, type EntryPoint, type Mixin, type Token } from './catalog.js'

type ThemeVariant = 'public' | 'intranet' | 'student-web' | 'external'
type AppType = ThemeVariant

/**
 * Every SCSS component published by @kth/style, plus two aliases kept for
 * callers that think in terms of behaviour rather than file names.
 * `navigation` and `modal` are not files in the package; they map onto the
 * dialog-based components that implement them.
 */
export const GUIDED_COMPONENTS = [
  'a11y-nav',
  'accordion',
  'alert',
  'breadcrumbs',
  'button',
  'content',
  'details',
  'footer',
  'header',
  'icon-button',
  'input',
  'kpm',
  'local-navigation',
  'logotype',
  'mega-menu',
  'menu-item',
  'menu-panel',
  'mobile-menu',
  'navigation',
  'search',
  'table',
  'tabs',
  'translation-panel',
  'modal',
  'visually-hidden',
] as const

type GuidedComponent = (typeof GUIDED_COMPONENTS)[number]

/** Aliases that resolve to the SCSS file actually implementing the behaviour. */
const COMPONENT_ALIASES: Partial<Record<GuidedComponent, string>> = {
  navigation: 'menu-panel',
  modal: 'menu-panel',
}

interface GuidanceToken extends Token {}

interface GuidanceIcon {
  name: string
  variants: Array<{
    variant: string
    relativePath: string | null
    dataUriVariable: string | null
    scssMixin: string | null
  }>
}

interface GuidanceDomHook {
  selectorType: 'id' | 'class' | 'css-variable' | 'attribute'
  name: string
  purpose: string
}

interface GuidanceDomNode {
  tag: string
  classes: string[]
  attributes: string[]
  required: boolean
  purpose: string
}

interface GuidanceScriptHook {
  import: string
  call: string
  purpose: string
}

export interface ThemeStructureSuggestion {
  appType: AppType
  summary: string
  entrypoints: EntryPoint[]
  coreComponents: Component[]
  recommendedTokens: GuidanceToken[]
  recommendedMixins: Mixin[]
  behaviorScripts: EntryPoint[]
  integrationNotes: string[]
  nextTools: string[]
}

export interface HeaderRecipe {
  variant: ThemeVariant
  themeTokenPrefix: string
  semanticContext: string
  summary: string
  styleComponents: Component[]
  requiredImports: string[]
  behaviorScripts: EntryPoint[]
  requiredDomHooks: GuidanceDomHook[]
  domStructure: GuidanceDomNode[]
  scriptHooks: GuidanceScriptHook[]
  activationClasses: string[]
  tokens: GuidanceToken[]
  mixins: Mixin[]
  icons: GuidanceIcon[]
  integrationNotes: string[]
}

export interface PageScaffold {
  pageType: AppType
  summary: string
  entrypoints: EntryPoint[]
  activationClasses: string[]
  sections: Array<{
    name: string
    purpose: string
    components: Component[]
    notes: string[]
  }>
  recommendedTokens: GuidanceToken[]
  recommendedMixins: Mixin[]
  behaviorScripts: EntryPoint[]
  integrationNotes: string[]
}

export interface ComponentGuidance {
  component: GuidedComponent
  variant: ThemeVariant | 'shared'
  summary: string
  components: Component[]
  behaviorScripts: EntryPoint[]
  tokens: GuidanceToken[]
  mixins: Mixin[]
  icons: GuidanceIcon[]
  domHooks: GuidanceDomHook[]
  notes: string[]
}

const THEME_CONFIG: Record<
  ThemeVariant,
  {
    themeTokenPrefix: string
    headerClass: string | null
    footerClass: string | null
    label: string
  }
> = {
  public: {
    themeTokenPrefix: 'theme-default',
    headerClass: null,
    footerClass: null,
    label: 'default/public',
  },
  intranet: {
    themeTokenPrefix: 'theme-intranet',
    headerClass: 'intranet',
    footerClass: 'intranet',
    label: 'intranet',
  },
  'student-web': {
    themeTokenPrefix: 'theme-student-web',
    headerClass: 'student-web',
    footerClass: 'student-web',
    label: 'student-web',
  },
  external: {
    themeTokenPrefix: 'theme-inverse',
    headerClass: 'external',
    footerClass: 'external',
    label: 'external/inverse',
  },
}

const SHARED_HEADER_HOOKS: GuidanceDomHook[] = [
  { selectorType: 'class', name: 'kth-header', purpose: 'Root header element that receives the theme variant class.' },
  { selectorType: 'class', name: 'kth-header__container', purpose: 'Flex container that aligns the logotype and header tools.' },
  { selectorType: 'class', name: 'kth-header__tools', purpose: 'Container for header tool buttons, menus, and search.' },
  { selectorType: 'class', name: 'kth-mobile-menu', purpose: 'Dialog-based mobile menu root used by MenuPanel.initModals.' },
  { selectorType: 'class', name: 'kth-menu-panel', purpose: 'Dialog-based menu/search panel opened by MenuPanel.init().' },
  { selectorType: 'class', name: 'kth-button menu', purpose: 'Menu trigger button that usually opens the mobile menu dialog.' },
  { selectorType: 'class', name: 'kth-icon-button close', purpose: 'Close button class looked up by MenuPanel dialog helpers.' },
  { selectorType: 'id', name: 'mobileMenuList', purpose: 'Legacy local-navigation script appends cloned main-menu items into this list.' },
  { selectorType: 'id', name: 'mainMenu', purpose: 'Legacy local-navigation script copies li elements from this menu into mobileMenuList.' },
  { selectorType: 'attribute', name: 'data-id', purpose: 'Buttons and dialogs share data-id values so MenuPanel.initModals can pair them.' },
]

function buildHeaderDomStructure(theme: (typeof THEME_CONFIG)[ThemeVariant]): GuidanceDomNode[] {
  const rootClasses = ['kth-header', theme.headerClass].filter((value): value is string => value !== null)

  return [
    {
      tag: 'header',
      classes: rootClasses,
      attributes: [],
      required: true,
      purpose: 'Root KTH header. Use the variant class here only; external uses class "external" while semantic tokens resolve from theme-inverse.',
    },
    {
      tag: 'div',
      classes: ['kth-header__container'],
      attributes: [],
      required: true,
      purpose: 'Direct child container. @kth/style applies the package container mixin and flex alignment to this element.',
    },
    {
      tag: 'a',
      classes: ['kth-logotype'],
      attributes: ['href'],
      required: true,
      purpose: 'KTH logotype link. Put the package-backed logotype image/SVG inside this element.',
    },
    {
      tag: 'nav',
      classes: ['kth-header__tools'],
      attributes: ['aria-label'],
      required: true,
      purpose: 'Header tools container for menu, search, language, and related actions.',
    },
    {
      tag: 'button',
      classes: ['kth-button', 'menu'],
      attributes: ['type="button"', 'data-id'],
      required: true,
      purpose: 'Menu trigger. Its data-id must match a dialog.kth-mobile-menu data-id when MenuPanel.initModals is used.',
    },
    {
      tag: 'dialog',
      classes: ['kth-mobile-menu'],
      attributes: ['data-id'],
      required: true,
      purpose: 'Mobile menu dialog paired with the menu trigger by matching data-id.',
    },
    {
      tag: 'button',
      classes: ['kth-icon-button', 'close'],
      attributes: ['type="button"', 'aria-label'],
      required: true,
      purpose: 'Close button inside dialogs. MenuPanel dialog helpers query this exact class combination.',
    },
    {
      tag: 'ul',
      classes: [],
      attributes: ['id="mainMenu"'],
      required: false,
      purpose: 'Legacy local-navigation source list. Required only when using localNavigation.ts cloning behavior.',
    },
    {
      tag: 'ul',
      classes: [],
      attributes: ['id="mobileMenuList"'],
      required: false,
      purpose: 'Legacy local-navigation mobile target list. Required only when using localNavigation.ts cloning behavior.',
    },
  ]
}

const HEADER_SCRIPT_HOOKS: GuidanceScriptHook[] = [
  {
    import: 'import { MenuPanel } from "@kth/style"',
    call: 'MenuPanel.initModals(document.querySelectorAll(".kth-button.menu"))',
    purpose: 'Pairs menu buttons with dialog.kth-mobile-menu elements by matching data-id values.',
  },
  {
    import: 'import { MenuPanel } from "@kth/style"',
    call: 'MenuPanel.init(document.querySelector(".kth-header__tools"), document.querySelectorAll(".kth-header__mega-menu--collapsable"))',
    purpose: 'Optional non-modal menu panel wiring for collapsible header menu panels.',
  },
]

export function suggestThemeStructure(catalog: Catalog, appType: AppType = 'public'): ThemeStructureSuggestion {
  const theme = THEME_CONFIG[appType]
  const coreComponents = selectComponents(catalog, [
    ['style-component', 'header'],
    ['style-component', 'footer'],
    ['style-component', 'content'],
    ['style-component', 'mobile-menu'],
    ['style-component', 'search'],
    ['style-component', 'breadcrumbs'],
    ['style-component', 'logotype'],
  ])

  if (appType === 'intranet' || appType === 'student-web') {
    coreComponents.push(...selectComponents(catalog, [['style-component', 'local-navigation']]))
  }

  if (appType === 'student-web') {
    coreComponents.push(...selectComponents(catalog, [['style-component', 'translation-panel']]))
  }

  return {
    appType,
    summary: `KTH Style ${theme.label} scaffold using the @kth/style package, CSS-variable theme mixins, and optional @kth/ui-components React wrappers.`,
    entrypoints: selectEntrypoints(catalog, [
      'reset',
      'fonts',
      'header',
      'footer',
      'content',
      'mobile-menu',
      'style-index',
      'ui-components-index',
    ]),
    coreComponents,
    recommendedTokens: selectTokens(catalog, [
      `${theme.themeTokenPrefix}.color-primary`,
      `${theme.themeTokenPrefix}.color-header`,
      `${theme.themeTokenPrefix}.color-on-header`,
      `${theme.themeTokenPrefix}.color-tertiary`,
      `${theme.themeTokenPrefix}.space-inner-inline`,
      `${theme.themeTokenPrefix}.space-inner-block`,
      'color-blue-kth',
      'space-16',
      'space-32',
    ]),
    recommendedMixins: selectMixins(catalog, [
      ['font-default', '/scss/tokens/typography.scss'],
      ['font-heading-s', '/scss/tokens/typography.scss'],
      ['font-heading-l-fluid', '/scss/tokens/typography.scss'],
    ]),
    behaviorScripts: selectEntrypoints(catalog, ['style-index', 'menu-panel-script', 'local-navigation-script', 'ui-components-index']),
    integrationNotes: [
      'Import reset.scss and fonts.css before component styles to get the baseline typography and font-face setup.',
      `Use .kth-header${theme.headerClass ? `.${theme.headerClass}` : ''} and .kth-footer${theme.footerClass ? `.${theme.footerClass}` : ''} for the ${theme.label} visual variant.`,
      'MenuPanel.ts powers dialog-based menu panels and mobile menus; localNavigation.ts still depends on #mainMenu and #mobileMenuList when used.',
      'Keep kpm.scss available if your app integrates the KTH personal menu / entrances header.',
      'Prefer @kth/ui-components when you want React wrappers for Button, Alert, InputGroup, TranslationPanel, and related components.',
    ],
    nextTools: ['get_header_recipe', 'get_page_scaffold', 'get_component_guidance'],
  }
}

export function getHeaderRecipe(catalog: Catalog, variant: ThemeVariant = 'public'): HeaderRecipe {
  const theme = THEME_CONFIG[variant]
  const styleComponents = selectComponents(catalog, [
    ['style-component', 'header'],
    ['style-component', 'mobile-menu'],
    ['style-component', 'menu-panel'],
    ['style-component', 'search'],
    ['style-component', 'logotype'],
    ['style-component', 'button'],
    ['style-component', 'kpm'],
  ])

  return {
    variant,
    themeTokenPrefix: theme.themeTokenPrefix,
    semanticContext: theme.themeTokenPrefix.replace(/^theme-/, ''),
    summary: `Dialog-based KTH header/navigation recipe for the ${theme.label} theme variant.`,
    styleComponents,
    requiredImports: styleComponents.map((component) => component.importPath).filter((value): value is string => value !== null),
    behaviorScripts: selectEntrypoints(catalog, ['menu-panel-script', 'local-navigation-script']),
    requiredDomHooks: SHARED_HEADER_HOOKS,
    domStructure: buildHeaderDomStructure(theme),
    scriptHooks: HEADER_SCRIPT_HOOKS,
    activationClasses: [theme.headerClass].filter((value): value is string => value !== null),
    tokens: selectTokens(catalog, [
      `${theme.themeTokenPrefix}.color-header`,
      `${theme.themeTokenPrefix}.color-on-header`,
      `${theme.themeTokenPrefix}.color-tertiary`,
      `${theme.themeTokenPrefix}.space-inner-inline`,
      `${theme.themeTokenPrefix}.space-inner-icon`,
    ]),
    mixins: selectMixins(catalog, [
      ['font-heading-m', '/scss/tokens/typography.scss'],
      ['font-default', '/scss/tokens/typography.scss'],
    ]),
    icons: selectIcons(catalog, ['menu', 'close', 'search', 'language', 'caret-right-big']),
    integrationNotes: [
      `Apply the ${theme.headerClass ? `"${theme.headerClass}"` : 'default (no extra)'} variant class on .kth-header for the ${theme.label} palette. Do not put the variant class on a wrapper.`,
      `Resolve semantic tokens with context "${theme.themeTokenPrefix.replace(/^theme-/, '')}" while using header class "${theme.headerClass ?? 'kth-header only'}".`,
      'Import header, logotype, button, mobile-menu, and menu-panel component SCSS for a complete package-styled header.',
      'Use .kth-header__container as the direct layout child and .kth-header__tools for actions; omitting these classes bypasses the package layout rules.',
      'MenuPanel.initModals pairs triggers and <dialog class="kth-mobile-menu"> elements through matching data-id values.',
      'MenuPanel dialog helpers look for .kth-icon-button.close and optional .kth-button.back elements inside dialogs.',
      'localNavigation.ts still clones #mainMenu items into #mobileMenuList, so keep those hooks if you use the legacy local-navigation behavior.',
    ],
  }
}

export function getPageScaffold(catalog: Catalog, pageType: AppType = 'public'): PageScaffold {
  const theme = THEME_CONFIG[pageType]
  const sections: PageScaffold['sections'] = [
    {
      name: 'header',
      purpose: 'Top-level branding, menus, search, and optional KPM integration.',
      components: selectComponents(catalog, [
        ['style-component', 'header'],
        ['style-component', 'mobile-menu'],
        ['style-component', 'menu-panel'],
        ['style-component', 'search'],
      ]),
      notes: ['Use MenuPanel.ts for dialog wiring and preserve the shared header DOM hooks when enabling menus or local navigation.'],
    },
    {
      name: 'main-content',
      purpose: 'Primary page layout container.',
      components: selectComponents(catalog, [['style-component', 'content']]),
      notes: ['Use .kth-main-content as the main container and compose page-specific components inside it.'],
    },
    {
      name: 'footer',
      purpose: 'Theme-matched footer area.',
      components: selectComponents(catalog, [['style-component', 'footer']]),
      notes: ['Mirror the header variant class on the footer when using intranet, student-web, or external themes.'],
    },
  ]

  if (pageType === 'intranet' || pageType === 'student-web') {
    sections.splice(1, 0, {
      name: 'local-navigation',
      purpose: 'Desktop/mobile local navigation column or mobile dialog list.',
      components: selectComponents(catalog, [['style-component', 'local-navigation']]),
      notes: ['The local-navigation script still expects #mainMenu and #mobileMenuList when cloning navigation to mobile.'],
    })
  } else {
    sections.splice(1, 0, {
      name: 'breadcrumbs',
      purpose: 'Contextual breadcrumbs above the main content.',
      components: selectComponents(catalog, [['style-component', 'breadcrumbs']]),
      notes: ['Breadcrumbs are pure SCSS styling and can be used without extra script wiring.'],
    })
  }

  if (pageType === 'student-web') {
    sections.splice(2, 0, {
      name: 'translation-panel',
      purpose: 'Optional translation dialog patterned after the provided React and SCSS components.',
      components: selectComponents(catalog, [
        ['style-component', 'translation-panel'],
        ['ui-component', 'TranslationPanel'],
      ]),
      notes: ['TranslationPanel is dialog-based and uses the shared close button/icon patterns from the style package.'],
    })
  }

  return {
    pageType,
    summary: `Deterministic ${theme.label} page scaffold for the @kth/style monorepo.`,
    entrypoints: selectEntrypoints(catalog, [
      'reset',
      'fonts',
      'header',
      'footer',
      'content',
      'mobile-menu',
      'local-navigation',
      'ui-components-index',
    ]),
    activationClasses: [theme.headerClass, theme.footerClass].filter((value): value is string => value !== null),
    sections,
    recommendedTokens: selectTokens(catalog, [
      `${theme.themeTokenPrefix}.color-primary`,
      `${theme.themeTokenPrefix}.color-background`,
      `${theme.themeTokenPrefix}.color-header`,
      `${theme.themeTokenPrefix}.space-inner-inline`,
      'space-16',
      'space-32',
    ]),
    recommendedMixins: selectMixins(catalog, [
      ['font-default', '/scss/tokens/typography.scss'],
      ['font-heading-s', '/scss/tokens/typography.scss'],
      ['font-heading-l-fluid', '/scss/tokens/typography.scss'],
    ]),
    behaviorScripts: selectEntrypoints(catalog, ['menu-panel-script', 'local-navigation-script', 'ui-components-index']),
    integrationNotes: [
      'Prefer the @kth/style SCSS component files as the styling source of truth and layer @kth/ui-components React wrappers on top when needed.',
      `Map pageType "${pageType}" to the ${theme.label} theme via ${theme.headerClass ? `.${theme.headerClass}` : 'the default header/footer classes without extra variant classes'}.`,
      'Keep kpm.scss in mind if the app sits below KTH personal menu / entrances content.',
    ],
  }
}

export function getComponentGuidance(
  catalog: Catalog,
  component: GuidedComponent,
  variant: ThemeVariant = 'public'
): ComponentGuidance {
  const theme = THEME_CONFIG[variant]

  switch (component) {
    case 'header':
      return {
        component,
        variant,
        summary: getHeaderRecipe(catalog, variant).summary,
        components: getHeaderRecipe(catalog, variant).styleComponents,
        behaviorScripts: getHeaderRecipe(catalog, variant).behaviorScripts,
        tokens: getHeaderRecipe(catalog, variant).tokens,
        mixins: getHeaderRecipe(catalog, variant).mixins,
        icons: getHeaderRecipe(catalog, variant).icons,
        domHooks: getHeaderRecipe(catalog, variant).requiredDomHooks,
        notes: getHeaderRecipe(catalog, variant).integrationNotes,
      }
    case 'footer':
      return {
        component,
        variant,
        summary: `Footer guidance for the ${theme.label} theme variant.`,
        components: selectComponents(catalog, [['style-component', 'footer']]),
        behaviorScripts: [],
        tokens: selectTokens(catalog, [
          `${theme.themeTokenPrefix}.color-header`,
          `${theme.themeTokenPrefix}.color-text`,
          `${theme.themeTokenPrefix}.space-inner-inline`,
        ]),
        mixins: selectMixins(catalog, [['font-heading-s', '/scss/tokens/typography.scss']]),
        icons: [],
        domHooks: [{ selectorType: 'class', name: 'kth-footer', purpose: 'Root footer element that receives the theme variant class.' }],
        notes: [`Apply ${theme.footerClass ? `.${theme.footerClass}` : 'no extra variant class'} on .kth-footer for the ${theme.label} palette.`],
      }
    case 'navigation':
      return {
        component,
        variant,
        summary: 'Dialog-based navigation and local-navigation guidance.',
        components: selectComponents(catalog, [
          ['style-component', 'mobile-menu'],
          ['style-component', 'menu-panel'],
          ['style-component', 'local-navigation'],
          ['style-component', 'breadcrumbs'],
        ]),
        behaviorScripts: selectEntrypoints(catalog, ['menu-panel-script', 'local-navigation-script']),
        tokens: selectTokens(catalog, [
          `${theme.themeTokenPrefix}.color-tertiary`,
          `${theme.themeTokenPrefix}.color-primary`,
          `${theme.themeTokenPrefix}.color-on-header`,
        ]),
        mixins: selectMixins(catalog, [
          ['font-heading-m', '/scss/tokens/typography.scss'],
          ['font-heading-s', '/scss/tokens/typography.scss'],
        ]),
        icons: selectIcons(catalog, ['menu', 'close', 'caret-right', 'caret-right-big', 'arrow-back']),
        domHooks: SHARED_HEADER_HOOKS,
        notes: ['MenuPanel.ts handles dialog open/close logic; localNavigation.ts handles cloning into mobileMenuList when you use the legacy mainMenu structure.'],
      }
    case 'search':
      return {
        component,
        variant,
        summary: 'Search input/button guidance for the style package.',
        components: selectComponents(catalog, [
          ['style-component', 'search'],
          ['style-component', 'header'],
          ['style-component', 'menu-panel'],
        ]),
        behaviorScripts: [],
        tokens: selectTokens(catalog, [
          `${theme.themeTokenPrefix}.color-secondary`,
          `${theme.themeTokenPrefix}.space-inner-inline`,
          `${theme.themeTokenPrefix}.space-inner-icon`,
        ]),
        mixins: selectMixins(catalog, [
          ['font-default', '/scss/tokens/typography.scss'],
          ['font-heading-s', '/scss/tokens/typography.scss'],
        ]),
        icons: selectIcons(catalog, ['search', 'spinner']),
        domHooks: [{ selectorType: 'class', name: 'kth-search', purpose: 'Search component root wrapper.' }],
        notes: ['The loading state is driven by the .loading class on the search button, which swaps the icon mixin to the spinner.'],
      }
    case 'button':
      return {
        component,
        variant: 'shared',
        summary: 'SCSS button styles plus the React Button wrapper.',
        components: selectComponents(catalog, [
          ['style-component', 'button'],
          ['ui-component', 'Button'],
          ['ui-component', 'IconButton'],
        ]),
        behaviorScripts: selectEntrypoints(catalog, ['ui-components-index']),
        tokens: selectTokens(catalog, [
          `${theme.themeTokenPrefix}.color-primary`,
          `${theme.themeTokenPrefix}.color-success`,
          `${theme.themeTokenPrefix}.color-error`,
          `${theme.themeTokenPrefix}.color-tertiary`,
        ]),
        mixins: selectMixins(catalog, [
          ['font-heading-xs', '/scss/tokens/typography.scss'],
          ['font-default', '/scss/tokens/typography.scss'],
        ]),
        icons: selectIcons(catalog, ['menu', 'arrow-back', 'arrow-forward-500']),
        domHooks: [{ selectorType: 'class', name: 'kth-button', purpose: 'Base button class used by both raw markup and the React wrapper.' }],
        notes: reactWrapperNotes(
          selectComponents(catalog, [['ui-component', 'Button'], ['ui-component', 'IconButton']]),
          'The React Button component maps variants directly onto the kth-button class names used in button.scss.'
        ),
      }
    case 'input':
      return {
        component,
        variant: 'shared',
        summary: 'Input, checkbox, radio, and InputGroup guidance.',
        components: selectComponents(catalog, [
          ['style-component', 'input'],
          ['ui-component', 'InputGroup'],
          ['ui-component', 'CheckboxOption'],
          ['ui-component', 'RadioButtonOption'],
        ]),
        behaviorScripts: selectEntrypoints(catalog, ['ui-components-index']),
        tokens: selectTokens(catalog, [
          `${theme.themeTokenPrefix}.color-primary`,
          `${theme.themeTokenPrefix}.color-error`,
          `${theme.themeTokenPrefix}.color-on-primary`,
          'space-24',
        ]),
        mixins: selectMixins(catalog, [
          ['font-heading-xs', '/scss/tokens/typography.scss'],
          ['font-default', '/scss/tokens/typography.scss'],
        ]),
        icons: selectIcons(catalog, ['input-checkbox', 'warning-500']),
        domHooks: [{ selectorType: 'class', name: 'kth-input', purpose: 'Base input wrapper class used by the style package.' }],
        notes: [
          'The .error modifier adds the left border and warning icon treatment.',
          ...reactWrapperNotes(
            selectComponents(catalog, [['ui-component', 'InputGroup'], ['ui-component', 'CheckboxOption'], ['ui-component', 'RadioButtonOption']]),
            'InputGroup, CheckboxOption and RadioButtonOption wrap the same kth-input/kth-checkbox/kth-radio classes.'
          ),
        ],
      }
    case 'table':
      return {
        component,
        variant: 'shared',
        summary: 'Table styling guidance from the style package.',
        components: selectComponents(catalog, [['style-component', 'table']]),
        behaviorScripts: [],
        tokens: selectTokens(catalog, [
          `${theme.themeTokenPrefix}.color-primary`,
          `${theme.themeTokenPrefix}.color-background-alt`,
          `${theme.themeTokenPrefix}.color-border`,
        ]),
        mixins: selectMixins(catalog, [['font-default', '/scss/tokens/typography.scss']]),
        icons: selectIcons(catalog, ['sort-asc', 'sort-desc', 'sort-unsorted']),
        domHooks: [{ selectorType: 'class', name: 'kth-table', purpose: 'Use the table component class and related semantic table markup.' }],
        notes: ['Keep semantic table markup; sorting affordances are handled via icon mixins rather than JS in this package.'],
      }
    case 'alert':
      return {
        component,
        variant: 'shared',
        summary: 'Alert styles plus the React Alert wrapper.',
        components: selectComponents(catalog, [
          ['style-component', 'alert'],
          ['ui-component', 'Alert'],
        ]),
        behaviorScripts: selectEntrypoints(catalog, ['ui-components-index']),
        tokens: selectTokens(catalog, [
          `${theme.themeTokenPrefix}.color-primary`,
          `${theme.themeTokenPrefix}.color-error`,
          `${theme.themeTokenPrefix}.color-success`,
        ]),
        mixins: selectMixins(catalog, [['font-default', '/scss/tokens/typography.scss']]),
        icons: selectIcons(catalog, ['info-500', 'warning-500', 'check-500']),
        domHooks: [{ selectorType: 'class', name: 'kth-alert', purpose: 'Base alert class used by both raw markup and the React wrapper.' }],
        notes: reactWrapperNotes(
          selectComponents(catalog, [['ui-component', 'Alert']]),
          'Alert.tsx maps the React variant prop to the same .info/.warning/.success classes used by alert.scss.'
        ),
      }
    case 'accordion':
      return {
        component,
        variant: 'shared',
        summary: 'Accordion styles and the summary-title toggle helper.',
        components: selectComponents(catalog, [['style-component', 'accordion']]),
        behaviorScripts: selectEntrypoints(catalog, ['style-index']),
        tokens: selectTokens(catalog, [
          `${theme.themeTokenPrefix}.color-tertiary`,
          `${theme.themeTokenPrefix}.space-inner-block`,
        ]),
        mixins: selectMixins(catalog, [['icon-caret-down', '/scss/tokens/icons.scss']]),
        icons: selectIcons(catalog, ['caret-right']),
        domHooks: [{ selectorType: 'class', name: 'kth-accordion', purpose: 'Accordion root class around <details> markup.' }],
        notes: [
          'The accordion is CSS-only over native <details>/<summary> markup; @kth/style ships no accordion script.',
          'See the details component for the related single-disclosure styling.',
        ],
      }
    case 'translation-panel':
    case 'modal':
      return {
        component,
        variant: 'shared',
        summary: 'Dialog-based translation/menu panel guidance.',
        components: selectComponents(catalog, [
          ['style-component', 'translation-panel'],
          ['style-component', 'menu-panel'],
          ['ui-component', 'TranslationPanel'],
          ['ui-component', 'Translation'],
          ['ui-component', 'TranslationLink'],
        ]),
        behaviorScripts: selectEntrypoints(catalog, ['menu-panel-script', 'ui-components-index']),
        tokens: selectTokens(catalog, [
          'theme-default.color-background',
          'theme-default.color-tertiary',
          'space-16',
          'space-32',
        ]),
        mixins: selectMixins(catalog, [['font-heading-m', '/scss/tokens/typography.scss']]),
        icons: selectIcons(catalog, ['close']),
        domHooks: [
          { selectorType: 'class', name: 'kth-translation', purpose: 'Dialog class used by TranslationPanel.' },
          { selectorType: 'class', name: 'kth-icon-button close', purpose: 'Close button lookup used by MenuPanel helpers and TranslationPanel.' },
          { selectorType: 'attribute', name: 'href', purpose: 'TranslationLink/TranslationPanel use href presence to decide whether to open the dialog or navigate directly.' },
        ],
        notes: [
          'TranslationPanel is a <dialog>; MenuPanel helpers can also wire non-modal and modal dialogs using the same close button convention.',
          'MenuPanel.initTranslationModal(button, modal) is the dedicated helper: it only opens the dialog when the trigger has no href, so a link falls through to navigation.',
        ],
      }
    case 'local-navigation':
      return {
        component,
        variant,
        summary: 'Local navigation styling plus the legacy mobile-menu cloning helper.',
        components: selectComponents(catalog, [
          ['style-component', 'local-navigation'],
          ['style-script', 'localNavigation'],
          ['style-component', 'mobile-menu'],
        ]),
        behaviorScripts: selectEntrypoints(catalog, ['local-navigation-script']),
        tokens: selectTokens(catalog, [
          `${theme.themeTokenPrefix}.color-primary`,
          `${theme.themeTokenPrefix}.color-tertiary`,
          'space-16',
        ]),
        mixins: selectMixins(catalog, [['icon-caret-right', '/scss/tokens/icons.scss']]),
        icons: selectIcons(catalog, ['caret-right', 'arrow-back']),
        domHooks: [
          { selectorType: 'id', name: 'mainMenu', purpose: 'Source list read by localNavigation.ts.' },
          { selectorType: 'id', name: 'mobileMenuList', purpose: 'Destination list appended to by localNavigation.ts.' },
        ],
        notes: ['Despite the newer dialog-based menu system, localNavigation.ts still clones li elements by DOM id.'],
      }
    default:
      return buildGenericGuidance(catalog, component, variant, theme)
  }
}

/**
 * What a component stylesheet actually references, read from its own source so
 * guidance stays package-backed instead of hand-maintained: the semantic CSS
 * variables it consumes, the Sass tokens and mixins it pulls in, the icon
 * mixins it applies, and the theme mixins it re-declares (which is what makes a
 * component theme-aware).
 */
interface ComponentSourceFacts {
  semanticTokens: string[]
  referenceTokens: string[]
  mixins: string[]
  icons: string[]
  themeContexts: string[]
}

function analyzeComponentSource(catalog: Catalog, component: Component | undefined): ComponentSourceFacts {
  const empty: ComponentSourceFacts = { semanticTokens: [], referenceTokens: [], mixins: [], icons: [], themeContexts: [] }
  if (!component) {
    return empty
  }

  const file = catalog.searchableFiles.find((candidate) => candidate.filePath === component.filePath)
  if (!file) {
    return empty
  }

  const unique = (values: string[]) => [...new Set(values)].sort()
  const matchAll = (pattern: RegExp) => [...file.content.matchAll(pattern)].map((match) => match[1])

  const includes = matchAll(/@include\s+[a-z0-9_-]+\.([a-z0-9_-]+)/gi)

  return {
    semanticTokens: unique(matchAll(/var\(\s*(--[a-z0-9-]+)/gi)),
    referenceTokens: unique(matchAll(/\$([a-z0-9-]+)/gi)),
    mixins: unique(includes.filter((name) => !name.startsWith('theme-') && !name.startsWith('icon-'))),
    icons: unique(includes.filter((name) => name.startsWith('icon-')).map((name) => name.replace(/^icon-/, ''))),
    themeContexts: unique(includes.filter((name) => name.startsWith('theme-')).map((name) => name.replace(/^theme-/, ''))),
  }
}

function domHooksFromClasses(component: Component | undefined): GuidanceDomHook[] {
  if (!component) {
    return []
  }
  return component.classes.map((name) => ({
    selectorType: 'class' as const,
    name,
    purpose: `Class selector declared by ${component.relativePath}.`,
  }))
}

/**
 * Guidance for any component without a bespoke entry. Everything reported is
 * derived from the component's own stylesheet, so components added to
 * @kth/style in later releases are covered without changing this file.
 */
function buildGenericGuidance(
  catalog: Catalog,
  component: GuidedComponent,
  variant: ThemeVariant,
  theme: (typeof THEME_CONFIG)[ThemeVariant]
): ComponentGuidance {
  const fileName = COMPONENT_ALIASES[component] ?? component
  const match = catalog.components.find(
    (candidate) => candidate.kind === 'style-component' && candidate.name === fileName
  )
  const facts = analyzeComponentSource(catalog, match)

  const notes: string[] = []
  if (!match) {
    notes.push(
      `No SCSS component named "${fileName}" exists in @kth/style ${catalog.packageInfo.version ?? 'unknown'}. No values were invented; check kth_style_list_components for the components this version publishes.`
    )
  } else {
    notes.push(`Import with @use "${match.importPath}" and style the classes listed in domHooks.`)
    if (facts.themeContexts.length > 0) {
      notes.push(
        `This component re-declares theme mixins for: ${facts.themeContexts.join(', ')}. Apply the matching variant class on its root element.`
      )
    } else {
      notes.push('This component declares no theme variants of its own; it inherits semantic tokens from the enclosing theme context.')
    }
    if (component !== fileName) {
      notes.push(`"${component}" is not a file in the package; it is served by ${match.relativePath}.`)
    }
  }

  return {
    component,
    variant: facts.themeContexts.length > 0 ? variant : 'shared',
    summary: match
      ? `Package-backed guidance for the ${fileName} component, derived from ${match.relativePath}.`
      : `No package-backed guidance available for "${component}".`,
    components: match ? [match] : [],
    behaviorScripts: [],
    tokens: selectTokens(catalog, [
      ...facts.semanticTokens.map((name) => `${theme.themeTokenPrefix}.${name.replace(/^--/, '')}`),
      ...facts.referenceTokens,
    ]),
    mixins: catalog.mixins.filter((mixin) => facts.mixins.includes(mixin.name)),
    icons: selectIcons(catalog, facts.icons),
    domHooks: domHooksFromClasses(match),
    notes,
  }
}

/**
 * React wrappers live in the separate @kth/ui-components package, which is not
 * a dependency of @kth/style. Only state that they exist when the catalog
 * actually indexed them.
 */
function reactWrapperNotes(components: Component[], note: string): string[] {
  return components.some((component) => component.kind === 'ui-component')
    ? [note]
    : ['React wrappers are not available: @kth/ui-components is not installed alongside this @kth/style package. The SCSS classes below are the supported interface.']
}

function selectComponents(catalog: Catalog, selectors: Array<[Component['kind'], string]>): Component[] {
  return catalog.components.filter((component) =>
    selectors.some(([kind, name]) => component.kind === kind && component.name === name)
  )
}

function selectEntrypoints(catalog: Catalog, names: string[]): EntryPoint[] {
  return catalog.entrypoints.filter((entrypoint) => names.includes(entrypoint.name))
}

function selectMixins(catalog: Catalog, selectors: Array<[string, string]>): Mixin[] {
  return catalog.mixins.filter((mixin) =>
    selectors.some(([name, pathFragment]) => mixin.name === name && mixin.filePath.replace(/\\/g, '/').includes(pathFragment))
  )
}

function selectTokens(catalog: Catalog, names: string[]): GuidanceToken[] {
  return names
    .map((name) => getToken(catalog, name))
    .filter((token): token is GuidanceToken => token !== null)
}

function selectIcons(catalog: Catalog, names: string[]): GuidanceIcon[] {
  return names
    .map((name) => getIcon(catalog, name))
    .filter((icon): icon is NonNullable<ReturnType<typeof getIcon>> => icon !== null)
    .map((icon) => ({
      name: icon.name,
      variants: icon.variants.map((variant) => ({
        variant: variant.variant,
        relativePath: variant.relativePath,
        dataUriVariable: variant.dataUriVariable,
        scssMixin: variant.scssMixin,
      })),
    }))
}

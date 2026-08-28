// Dialog wiring for the sample header.
//
// MenuPanel is the only JavaScript @kth/style exports. The bundle is copied in
// at build time from the entrypoint path get_entrypoints reported, because MCP
// serves data about the package rather than the package's own code assets.
import { MenuPanel } from './assets/menu-panel.js'

const header = document.querySelector('.kth-header')

// Non-modal panels: the mega-menu items and the search trigger.
MenuPanel.init(header, document.querySelectorAll('.kth-mega-menu .kth-menu-item'))
MenuPanel.init(header, document.querySelectorAll('.kth-menu-item.search'))

// The mobile menu is a modal dialog paired with the collapsable trigger.
MenuPanel.initModal(
  document.querySelector('.kth-menu-item.collapsable'),
  document.querySelector('.kth-mobile-menu')
)

// The language dialog opens only when the trigger has no href of its own.
MenuPanel.initTranslationModal(
  document.querySelector('.kth-menu-item.language'),
  document.querySelector('.kth-translation')
)

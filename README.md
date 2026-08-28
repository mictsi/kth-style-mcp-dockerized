# kth-style-mcp

MCP server for querying the modern KTH Style monorepo at [`style`](https://github.com/KTH/style), especially the `@kth/style` and `@kth/ui-components` packages.

Instead of rebuilding styles, this server indexes the source repository so agents can ask for:

- primitive color, typography, and spacing tokens
- parsed theme CSS-variable assignments from theme mixins
- Sass mixins and icon helpers
- SCSS components, TypeScript behaviors, and React wrappers
- SVG/logotype assets and icon mixin metadata
- higher-level theme guidance for app structure and component wiring

## Where values come from

This server returns **only package-backed values** parsed directly from the installed `@kth/style` package. It never approximates, infers, or hand-authors KTH theme values.

Package discovery order (first match wins), recorded as `package.source` provenance on responses:

1. An explicit directory passed to `buildCatalog()` (used in tests) — `source: "explicit"`.
2. `KTH_STYLE_SOURCE_DIR` if set — `source: "source-dir"`. Point it at the monorepo root or the `@kth/style` package directory.
3. The installed package found by scanning upward for `node_modules/@kth/style` — `source: "installed"` (the authoritative default).
4. A legacy `../style` monorepo fallback — `source: "monorepo-default"`. This case adds an explicit diagnostic warning that values were not loaded from an installed package.

```bash
# Optional override (dev against a cloned monorepo)
export KTH_STYLE_SOURCE_DIR=/absolute/path/to/style
```

If the package cannot be located, theme/token/package tools return a structured `package-not-found` diagnostic; if `package.json` cannot be parsed they return a `parser-error` diagnostic. They never fall back to invented values.

## Install and run

```bash
npm install
npm run build
npm start
```

For local development:

```bash
npm run dev
```

## MCP configuration

Example stdio configuration:

```json
{
  "mcpServers": {
    "kth-style": {
      "command": "node",
      "args": ["/absolute/path/to/kth-style-mcp/dist/index.js"],
      "env": {
        "KTH_STYLE_SOURCE_DIR": "/absolute/path/to/style"
      }
    }
  }
}
```

## Available tools

Authoritative, package-backed tools (use these for exact KTH values; responses include package version and `source` provenance):

- `kth_style_get_theme` — return the package-backed theme for a context: exact reference tokens, semantic tokens, assets, recommended SCSS imports, available contexts, and diagnostics
- `kth_style_get_package_info` — installed package name, version, package path, asset root, and available Sass/CSS/token/asset files
- `kth_style_list_tokens` — list exact reference (Sass) and semantic (CSS custom property) tokens separately, with raw/resolved values and source provenance
- `kth_style_get_token` — fetch one exact token by name (e.g. `$color-blue-kth`, `--color-primary`), optionally per context
- `kth_style_list_components` — list package component Sass import paths exactly as found in the installed package

Guidance and discovery helpers:

- `suggest_theme_structure` — recommend the right `@kth/style` entrypoints, theme tokens, scripts, and components for a KTH app shape
- `get_header_recipe` — explain the header/navigation wiring, including dialog hooks and the remaining legacy local-navigation IDs
- `get_page_scaffold` — suggest a deterministic public/intranet/student-web/external page scaffold
- `get_component_guidance` — drill into a component area such as header, footer, navigation, button, input, alert, accordion, or translation-panel
- `search_tokens` — search primitive tokens and parsed theme CSS-variable assignments
- `get_token` — fetch one token by name
- `search_mixins` — discover Sass mixins such as typography, icon, and theme helpers
- `list_components` — list SCSS components/utilities/tokens and source TS/TSX components
- `search_icons` — search icon/logotype names and their Sass icon metadata
- `get_icon` — fetch SVG content, Sass data-URI variable names, and SCSS icon mixin names
- `search_styles` — line-based search across authored SCSS, TypeScript, and TSX
- `get_entrypoints` — show the main SCSS/CSS/TypeScript entrypoints
- `refresh_catalog` — rebuild the in-memory index after source changes

## Notes

- `search_tokens` parses theme mixins like `theme-default` and exposes entries such as `theme-default.color-primary`.
- Icons in `@kth/style` are colorless by design; they are styled via `mask-image`/`currentColor`, so the old color-variant lookup model no longer applies.
- `src/react.ts` in `@kth/style` is intentionally ignored as an entrypoint because it is currently just a stub.
- `localNavigation.ts` still depends on `#mainMenu` and `#mobileMenuList` even though the newer menu system is dialog-based.

## Example agent-oriented flow

For a request like **"build me an app using the KTH theme"**, an agent can now:

1. Call `suggest_theme_structure` with `appType: "public"`, `"intranet"`, `"student-web"`, or `"external"`.
2. Call `get_header_recipe` to get the required dialog hooks, variant classes, and any legacy DOM IDs still needed.
3. Call `get_page_scaffold` for the overall shell.
4. Call `get_component_guidance` for focused areas like `button`, `input`, `alert`, `navigation`, or `translation-panel`.

These tools are deterministic summaries over the indexed `style` monorepo; they do not generate app code themselves.

## Credits

MCP server created by [jrolofsson](https://github.com/jrolofsson).

Style values are sourced from the KTH [`style`](https://github.com/KTH/style) monorepo; this server only indexes and reports them.

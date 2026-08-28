# Third-party notices

`kth-style-mcp` is distributed under the MIT license (see [LICENSE](LICENSE)). It bundles
the third-party packages listed below in its production dependency tree, and the Docker
image ships them under `/app/node_modules`, each with its own license file.

This file is generated from the installed production tree by
`npm run notices` ([scripts/generate-notices.mjs](scripts/generate-notices.mjs)).
Regenerate it whenever dependencies change.

## Items needing attention

**`@kth/style` is MIT, but the published package does not say so.** The source repository
[github.com/KTH/style](https://github.com/KTH/style) carries an MIT `LICENSE`
(Copyright (c) 2024 KTH Royal Institute of Technology), so the grant exists and is compatible
with this project. The published npm package is the problem: `@kth/style@1.14.1` ships no
`license` field, no `LICENSE` file, and no `repository` link, so the grant does not travel with
the artifact the Docker image redistributes. The fix is upstream — add `license: "MIT"` and
include the `LICENSE` file in the package's `files` list.

**`@kth/style` bundles assets with their own terms.**

- `assets/figtree.woff2`, `assets/figtree-italic.woff2` — the Figtree typeface, published
  upstream under the SIL Open Font License 1.1, which requires the copyright and license
  notice to travel with the font. No such notice is present in the package.
- `assets/logotype/logotype-blue.svg`, `assets/logotype/logotype-white.svg` — the KTH
  logotype. Trademarks are not covered by a source license; usage follows KTH's
  visual-identity rules regardless of the code license.

**Test fixtures contain excerpts of `@kth/style` source.** `test/fixtures/style/@kth/style/`
holds short verbatim excerpts of KTH SCSS (for example `scss/components/header.scss`) used as
parser fixtures. These are covered by the upstream MIT license; the attribution above applies.

**The base image carries its own licenses.** `node:22-alpine` bundles Node.js (MIT), OpenSSL
(Apache-2.0), musl libc (MIT) and BusyBox (GPL-2.0-only), among others. The GPL-2.0 component
is BusyBox as shipped by Alpine; it is aggregated in the image, not linked into this
application, so it does not affect the license of this project's own code. Anyone
redistributing the built image inherits Alpine's and Node's distribution obligations.

## No license conflicts in the resolved tree

Every dependency is permissive (MIT, ISC, BSD-2-Clause, BSD-3-Clause) and compatible with this
project's MIT license. No copyleft (GPL/LGPL/AGPL), source-available (BUSL/SSPL/Elastic), or
non-commercial licenses appear in the production tree. `@kth/style` is MIT upstream; the only
open item is that its published package omits the declaration, as described above.

### Attribution for `@kth/style`

```text
MIT License

Copyright (c) 2024 KTH Royal Institute of Technology
```

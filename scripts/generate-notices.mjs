#!/usr/bin/env node
/**
 * Regenerates THIRD_PARTY_NOTICES.md from the installed production
 * dependency tree. Run after changing dependencies:
 *
 *   npm ci && npm run notices
 *
 * The file is committed so the attribution ships with the source, not only
 * with the image (which carries each package's own LICENSE under node_modules).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'THIRD_PARTY_NOTICES.md')
const LICENSE_FILE = /^(LICEN[CS]E|COPYING|NOTICE)/i

function productionDirs() {
  const raw = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return new Set(
    raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && line !== ROOT)
  )
}

function readLicenseField(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license === 'object') return pkg.license.type ?? 'UNKNOWN'
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map(l => l.type ?? l).join(' OR ')
  return 'UNKNOWN'
}

function collect(dir, prod, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.bin') continue
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue

    const full = path.join(dir, entry.name)
    if (entry.name.startsWith('@')) {
      collect(full, prod, acc)
      continue
    }

    const manifest = path.join(full, 'package.json')
    if (!fs.existsSync(manifest)) continue

    let pkg
    try {
      pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'))
    } catch {
      continue
    }

    const real = fs.realpathSync(full)
    if (prod.has(real) || prod.has(full)) {
      const licenseFile = fs.readdirSync(full).find(f => LICENSE_FILE.test(f))
      acc.push({
        name: pkg.name ?? entry.name,
        version: pkg.version ?? '',
        license: readLicenseField(pkg),
        homepage: pkg.homepage ?? repoUrl(pkg),
        text: licenseFile ? fs.readFileSync(path.join(full, licenseFile), 'utf8').trim() : null,
      })
    }

    const nested = path.join(full, 'node_modules')
    if (fs.existsSync(nested)) collect(nested, prod, acc)
  }
}

function repoUrl(pkg) {
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  if (!repo) return null
  return repo.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '')
}

const packages = []
collect(path.join(ROOT, 'node_modules'), productionDirs(), packages)
packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))

const byLicense = new Map()
for (const pkg of packages) {
  byLicense.set(pkg.license, (byLicense.get(pkg.license) ?? 0) + 1)
}

const summary = [...byLicense.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([license, count]) => `| \`${license}\` | ${count} |`)
  .join('\n')

const index = packages
  .map(pkg => `| \`${pkg.name}\` | ${pkg.version} | \`${pkg.license}\` |`)
  .join('\n')

const texts = packages
  .map(pkg => {
    const heading = `### ${pkg.name}@${pkg.version}\n\nLicense: \`${pkg.license}\`${pkg.homepage ? `  \nHomepage: ${pkg.homepage}` : ''}`
    const body = pkg.text
      ? `\n\n\`\`\`text\n${pkg.text.replace(/```/g, "'''")}\n\`\`\`\n`
      : `\n\n> No license file is included in the published package. See the notes in THIRD_PARTY_NOTICES.md.\n`
    return heading + body
  })
  .join('\n')

const header = fs.readFileSync(path.join(ROOT, 'scripts', 'notices-header.md'), 'utf8').trim()

fs.writeFileSync(
  OUT,
  `${header}\n\n## License summary\n\n| License | Packages |\n| --- | --- |\n${summary}\n\n## Packages\n\n| Package | Version | License |\n| --- | --- | --- |\n${index}\n\n## Full license texts\n\n${texts}`
)

console.log(`wrote ${path.relative(ROOT, OUT)} (${packages.length} production packages)`)

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')

describe('public package hygiene after the frozen ASR decision', () => {
  it('ships no dead model runtime or remote font dependency', () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const css = readFileSync(join(ROOT, 'src/styles.css'), 'utf8')

    expect(packageJson.dependencies ?? {}).not.toHaveProperty('@huggingface/transformers')
    expect(existsSync(join(ROOT, 'public/models'))).toBe(false)
    expect(existsSync(join(ROOT, 'public/ort'))).toBe(false)
    expect(css).not.toContain('@import url(')
  })

  it('contains public-repo license and reproducible run instructions', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
    const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8')
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8')
    expect(readme).toContain('pnpm install --frozen-lockfile')
    expect(readme).toContain('pnpm test')
    expect(readme).toContain('pnpm build')
    expect(readme).toContain('one calibrated synthetic phrase')
    expect(license).toContain('MIT License')
    expect(gitignore).toContain('node_modules/')
    expect(gitignore).toContain('dist/')
  })

  it('places exactly one origin-trial tag before the application script', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
    expect(html.match(/http-equiv="origin-trial"/g)).toHaveLength(1)
    expect(html.indexOf('http-equiv="origin-trial"')).toBeLessThan(
      html.indexOf('/src/main.ts'),
    )
  })
})

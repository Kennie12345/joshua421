import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import vm from 'node:vm'
import { repoRoot } from '../setup/paths'

const pagePath = join(repoRoot, 'docs/go/index.html')

test('the Claude bounce page has no automatic network surface', async () => {
  const page = await readFile(pagePath, 'utf8')
  const styles = page.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
  const forbidden = [
    /<script\b[^>]*\bsrc=/i,
    /<link\b[^>]*\bhref=/i,
    /<(?:img|iframe|object|embed|video|audio|source)\b[^>]*\bsrc=/i,
    /<form\b[^>]*\baction=/i,
    /\bfetch\s*\(/i,
    /\bXMLHttpRequest\b/,
    /\bsendBeacon\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
  ]

  for (const pattern of forbidden) {
    assert.doesNotMatch(page, pattern, `bounce page must not contain network surface ${pattern}`)
  }
  assert.doesNotMatch(styles, /@import\b/i)
  assert.doesNotMatch(styles, /\burl\s*\(/i)
  assert.match(page, /<meta name="referrer" content="no-referrer">/)
})

test('the actual bounce script preserves the fragment prompt through the Desktop URL', async () => {
  const page = await readFile(pagePath, 'utf8')
  const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script, 'page has one inline bounce script')

  const starter = 'Space + literal %25 & café ☕\n教会'
  const elements = new Map(
    ['lede', 'empty', 'fallback', 'again', 'copy', 'prompt'].map((id) => [
      id,
      { hidden: true, href: '', value: '', addEventListener() {}, select() {} },
    ]),
  )
  let replacedWith = ''
  const location = {
    hash: `#q=${encodeURIComponent(starter)}`,
    replace(href: string) {
      replacedWith = href
    },
  }

  vm.runInNewContext(script, {
    URL,
    URLSearchParams,
    location,
    navigator: {},
    document: {
      getElementById(id: string) {
        return elements.get(id)
      },
      execCommand() {},
    },
  })

  const target = new URL(replacedWith)
  assert.equal(target.protocol, 'claude:')
  assert.equal(target.host, 'claude.ai')
  assert.equal(target.pathname, '/new')
  assert.deepEqual([...target.searchParams.keys()], ['q'])
  assert.equal(target.searchParams.get('q'), starter)
  assert.equal(elements.get('prompt')!.value, starter)
  assert.equal(elements.get('again')!.href, replacedWith)
})

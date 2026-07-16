import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { shQuote, xmlEscape } from './paths'

/**
 * shQuote guards the GENERATED sh launcher (bin/joshua421-mcp) against a repo path
 * that contains a space or a shell metacharacter. The real test is behavioural:
 * a POSIX shell must echo the quoted value back byte-for-byte, with no expansion.
 */
test('shQuote survives a real shell for spaces, $, backticks, quotes, and backslashes', () => {
  const nasties = [
    '/plain/path',
    '/path with spaces/mcp.ts',
    '/path/$HOME/x',
    '/path/`whoami`/x',
    `/path/with'quote/x`,
    '/path/with"dquote/x',
    '/path/with\\backslash/x',
    '/a; rm -rf ~/b', // the injection attempt must come back as literal text
  ]
  for (const raw of nasties) {
    const echoed = execFileSync('sh', ['-c', `printf %s ${shQuote(raw)}`]).toString()
    assert.equal(echoed, raw, `shell must echo ${JSON.stringify(raw)} unchanged`)
  }
})

test('xmlEscape neutralises the plist-breaking characters', () => {
  assert.equal(xmlEscape('a & b < c > d "e"'), 'a &amp; b &lt; c &gt; d &quot;e&quot;')
  assert.equal(xmlEscape('/normal/path'), '/normal/path')
})

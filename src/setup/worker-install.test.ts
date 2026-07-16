import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { plistXml } from './worker-install'

/**
 * The launchd plist is what actually runs the heartbeat, so it must be valid and
 * carry the right job. It passes args as an ARRAY (no shell), so the only escaping
 * it needs is XML — proven here by feeding launchd's own parser (plutil) a plist
 * built from a path containing XML-special characters.
 */

test('plistXml carries the job, schedule, and absolute argv, and does not run at load', () => {
  const xml = plistXml({ job: 'morning', hour: 7 }, '/usr/bin/node', '/repo/node_modules/tsx/dist/cli.mjs')
  assert.match(xml, /<string>com\.joshua421\.morning<\/string>/)
  assert.match(xml, /<key>Hour<\/key><integer>7<\/integer>/)
  assert.match(xml, /<key>RunAtLoad<\/key><false\/>/, 'must not fire immediately on load')
  // The four argv entries: node, tsx cli, worker.ts, the job name.
  assert.match(xml, /<string>\/usr\/bin\/node<\/string>/)
  assert.match(xml, /<string>\/repo\/node_modules\/tsx\/dist\/cli\.mjs<\/string>/)
  assert.match(xml, /src\/worker\.ts<\/string>/)
  assert.match(xml, /<array>[\s\S]*<string>morning<\/string>[\s\S]*<\/array>/)
})

test('plistXml XML-escapes a path with & and < so the plist stays well-formed (plutil-linted)', async () => {
  const nasty = '/Users/a & b/<repo>/node'
  const xml = plistXml({ job: 'evening', hour: 20 }, nasty, '/tsx/cli.mjs')
  assert.ok(!/[^&]&[^a-z#]/.test(xml.replace(/&(amp|lt|gt|quot);/g, '')), 'raw & must be escaped')
  assert.match(xml, /&amp;/)
  assert.match(xml, /&lt;repo&gt;/)

  // Ask launchd's own parser to validate it — the authoritative check.
  let plutil = true
  try {
    execFileSync('which', ['plutil'])
  } catch {
    plutil = false
  }
  if (plutil) {
    const path = join(await mkdtemp(join(tmpdir(), 'joshua421-plist-')), 'a.plist')
    await writeFile(path, xml, 'utf8')
    // Throws (non-zero exit) if the plist is malformed; passes silently if valid.
    const out = execFileSync('plutil', ['-lint', path]).toString()
    assert.match(out, /OK/, 'plutil must accept the generated plist')
  }
})

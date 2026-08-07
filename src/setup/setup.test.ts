import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyClaudeCodeProbe } from './setup'

test('Claude Code probe distinguishes an absent CLI from nonzero CLI results', () => {
  assert.equal(classifyClaudeCodeProbe('', 'ENOENT'), 'no-cli')
  assert.equal(classifyClaudeCodeProbe('', 'ETIMEDOUT'), 'missing')
  assert.equal(classifyClaudeCodeProbe('No MCP server named "joshua421".', '1'), 'missing')
  assert.equal(classifyClaudeCodeProbe('joshua421:\n  Scope: User config', '1'), 'has')
})

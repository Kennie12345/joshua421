import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { updateEnvFile } from './env-file'

const scratch = () => mkdtemp(join(tmpdir(), 'joshua421-env-'))

test('updateEnvFile replaces a key in place — comments and order survive', async () => {
  const path = join(await scratch(), '.env')
  await writeFile(
    path,
    ['# Google OAuth', 'GOOGLE_CLIENT_ID=old', 'GOOGLE_CLIENT_SECRET=', '# db', 'JOSHUA421_DB=./joshua421.sqlite'].join('\n'),
    'utf8',
  )

  await updateEnvFile(path, { GOOGLE_CLIENT_ID: 'new-id', GOOGLE_CLIENT_SECRET: 's3cret' })

  const text = await readFile(path, 'utf8')
  assert.deepEqual(text.split('\n'), [
    '# Google OAuth',
    'GOOGLE_CLIENT_ID=new-id',
    'GOOGLE_CLIENT_SECRET=s3cret',
    '# db',
    'JOSHUA421_DB=./joshua421.sqlite',
  ])
})

test('updateEnvFile appends keys the file does not have, and creates a missing file', async () => {
  const dir = await scratch()
  const existing = join(dir, '.env')
  await writeFile(existing, 'GOOGLE_CLIENT_ID=id\n', 'utf8')
  await updateEnvFile(existing, { GOOGLE_REFRESH_TOKEN: 'tok' })
  assert.equal(await readFile(existing, 'utf8'), 'GOOGLE_CLIENT_ID=id\nGOOGLE_REFRESH_TOKEN=tok\n')

  const fresh = join(dir, 'fresh.env')
  await updateEnvFile(fresh, { A: '1', B: '2' })
  assert.equal(await readFile(fresh, 'utf8'), 'A=1\nB=2\n')
})

test('updateEnvFile never touches a commented-out key or a lookalike suffix', async () => {
  const path = join(await scratch(), '.env')
  await writeFile(path, '# GOOGLE_CLIENT_ID=commented\nNOT_GOOGLE_CLIENT_ID=other\n', 'utf8')

  await updateEnvFile(path, { GOOGLE_CLIENT_ID: 'real' })

  const text = await readFile(path, 'utf8')
  assert.ok(text.includes('# GOOGLE_CLIENT_ID=commented'), 'the comment stays a comment')
  assert.ok(text.includes('NOT_GOOGLE_CLIENT_ID=other'), 'the lookalike key is untouched')
  assert.ok(text.includes('\nGOOGLE_CLIENT_ID=real'), 'the real key is appended')
})

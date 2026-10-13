import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { redact } from './log.js'

describe('log', () => {
  it('masks webhook keys, OAuth secrets, test links and passwords', () => {
    const text = [
      'POST https://ammir.bitrix24.ru/rest/36/riyz3ld29ot0ij2t/disk.file.get.json',
      'https://oauth.bitrix.info/oauth/token/?grant_type=authorization_code&client_id=local.1&client_secret=s3cr3t&code=abc123',
      'https://portal/rest/user.current.json?auth=tok-123',
      'GET /api/public/test/AbCdEfGhIjKlMnOpQrStUvWx/start',
      'https://erp.ammir.org/t/AbCdEfGhIjKlMnOpQrStUvWx',
      '{"login":"ivanov","password":"пароль-123"}',
      'AUTH_ID=token-1&REFRESH_ID=token-2',
    ].join('\n')
    const safe = redact(text)
    for (const secret of ['riyz3ld29ot0ij2t', 's3cr3t', 'abc123', 'tok-123', 'AbCdEfGhIjKlMnOpQrStUvWx', 'пароль-123', 'token-1', 'token-2']) {
      assert.ok(!safe.includes(secret), `${secret} is masked`)
    }
    assert.match(safe, /\/rest\/36\/\*\*\*\/disk/)
    assert.match(safe, /client_id=local\.1/)
    assert.match(safe, /"login":"ivanov"/)
  })
})

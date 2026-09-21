const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePassword } = require('../src/password-policy');
const { getPasswordError } = require('../../miniprogram/services/password-policy');
const { hashPassword, verifyPassword } = require('../src/password');

test('new passwords have no length limit and require all three character types; symbols are optional', () => {
  for (const password of ['Ab1', 'Ab123!', 'A' + 'b'.repeat(500) + '1']) {
    assert.equal(validatePassword(password), password);
    assert.equal(getPasswordError(password), '');
  }
});

test('empty values and missing character types are rejected consistently', () => {
  for (const password of ['', null, 'abcdef1', 'ABCDEF1', 'Abcdef', '123456']) {
    assert.throws(() => validatePassword(password), error => {
      assert.equal(error.status, 400);
      assert.equal(error.message, getPasswordError(password));
      return true;
    });
  }
});

test('existing password hashes remain verifiable without enforcing the new creation policy', async () => {
  const existingPassword = 'legacy12345';
  const hash = await hashPassword(existingPassword);
  assert.equal(await verifyPassword(existingPassword, hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

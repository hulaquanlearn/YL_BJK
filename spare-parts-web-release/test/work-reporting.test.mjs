import test from 'node:test'
import assert from 'node:assert/strict'
import { reportingDuty, reportingStatus } from '../src/utils/work-reporting.mjs'

test('editing old feedback uses current choices while viewing retains the evidence snapshot', () => {
  const snapshot = { id: 'team_feedback', options: ['无异常', '有异常'] }
  const current = { id: 'team_feedback', reportMode: 'result', options: ['正常', '异常'] }
  const check = { status: '有异常', dutySnapshot: snapshot, note: '已发现问题', action: '正在跟进' }
  assert.equal(reportingDuty(check, current, false), snapshot)
  assert.equal(reportingDuty(check, current, true), current)
  assert.equal(reportingStatus(check.status, current), '异常')
  assert.equal(reportingStatus('无异常', current), '正常')
  assert.equal(check.status, '有异常')
  assert.equal(check.note, '已发现问题')
  assert.equal(check.action, '正在跟进')
  assert.equal(reportingStatus('伪造结果', current), '')
})

test('document-only editing removes stale judgments and custom choices remain usable', () => {
  const document = { reportMode: 'document', options: ['已提交材料'] }
  assert.equal(reportingStatus('异常', document), '已提交材料')
  assert.equal(reportingStatus('', document), '已提交材料')
  assert.equal(reportingStatus('发现问题', { options: ['发现问题', '未发现'] }), '发现问题')
  assert.equal(reportingDuty({ dutySnapshot: document }, undefined, true), document)
})

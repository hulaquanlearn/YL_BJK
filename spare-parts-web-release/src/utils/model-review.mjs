const statuses = { approved: '核对通过', needs_fix: '需修正', pending: '待核对' }
export const modelReviewStatusLabel = status => statuses[status] || '待核对'
export function modelReviewLabel(review) {
  if (review?.stale || review?.valid === false && review?.versionHash) return '版本已变更，需重新核对'
  return statuses[review?.status] || '尚无人工核对记录'
}
export function modelReviewConfirmed(model) {
  return model?.reviewDecision?.valid === true && model.reviewDecision.status === 'approved' && model.reviewDecision.stale !== true
}
export function modelReviewInputKey(model) {
  return JSON.stringify([model?.name || '', model?.modelUrl || '', Number(model?.frontRotationY) || 0, model?.imageUrl || '', model?.updatedAt || '', Number(model?.associatedParts) || 0])
}
export function withModelReviewDecision(model, decisions = {}) {
  const decision = decisions[String(model?.id)]
  if (model?.reviewDecision?.stale || model?.reviewDecision && Number(model.reviewDecision.id) > Number(decision?.review?.id || 0)) return model
  return decision?.inputKey === modelReviewInputKey(model) ? { ...model, reviewDecision: decision.review } : model
}
export function buildModelReviewPayload(form, detail, requestId) {
  const hash = detail?.version?.hash
  if (!/^[a-f0-9]{64}$/.test(String(hash || ''))) throw new Error('当前模型版本尚未读取完成，请重新加载')
  if (!Object.hasOwn(statuses, form.status)) throw new Error('请选择核对结论')
  const note = String(form.note || '').trim()
  if (note.length < (form.status === 'approved' ? 10 : 2) || note.length > 2000) throw new Error(form.status === 'approved' ? '请用至少10字说明对照依据和核对情况' : '请填写待核对或需修正的具体原因')
  const allowedTypes = ['physical_photo', 'manufacturer_reference', 'onsite']
  if (!allowedTypes.includes(form.referenceType)) throw new Error('请选择对照依据')
  const rawPartId = form.referencePartId
  const referencePartId = rawPartId === '' || rawPartId == null ? null : Number(rawPartId)
  if (referencePartId !== null && (!Number.isSafeInteger(referencePartId) || referencePartId <= 0)) throw new Error('请选择有效关联备件')
  const part = (detail.parts || []).find(item => Number(item.id) === referencePartId)
  if (referencePartId !== null && !part) throw new Error('所选备件已不在当前模型的关联范围，请重新加载')
  const checks = { identity: form.checks?.identity === true, outline: form.checks?.outline === true, interfaces: form.checks?.interfaces === true }
  if (form.status === 'approved') {
    if (!detail.version.available || !detail.version.modelFileHash) throw new Error('缺少可核对的三维文件，不能确认通过')
    if (detail.parts?.length && !part) throw new Error('请明确选择本次对照的关联备件')
    if (!Object.values(checks).every(Boolean)) throw new Error('请逐项完成身份、外形及接口核对后再确认通过')
    if (form.referenceType === 'physical_photo' && !part?.partImageUrl) throw new Error('该备件尚无实物照片，请先上传或选择现场核对')
    if (form.referenceType === 'physical_photo' && detail.version.partImages?.find(image => Number(image.partId) === referencePartId)?.available === false) throw new Error('当前实物照片不可读取，请先补充有效照片后核对')
    if (form.referenceType === 'manufacturer_reference' && !detail.model?.imageUrl) throw new Error('当前模型尚无参考图，请先补充或选择现场核对')
    if (form.referenceType === 'manufacturer_reference' && detail.version.modelImage?.available === false) throw new Error('当前参考图不可读取，请先补充有效资料后核对')
  }
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(requestId))) throw new Error('核对提交标识无效，请重新打开核对')
  return { expectedVersionHash: hash, status: form.status, note, referencePartId, referenceType: form.referenceType, checks, requestId }
}

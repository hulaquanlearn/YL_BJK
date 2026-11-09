import { modelReview } from './model-observation.mjs'

// Availability describes what the user will see after binding, not CAD accuracy.
export function modelDisplayStatus(model) {
  const url = String(typeof model === 'string' ? model : model?.modelUrl || '').trim()
  if (!url) return { key: 'missing', label: '缺少三维文件', description: '可以先保存名称绑定；上传 GLB 文件后才能展示三维外观。' }
  const decision = typeof model === 'object' ? model?.reviewDecision : null
  if (decision?.stale || decision?.valid === false && decision?.versionHash) return { key:'pending', label:'版本已变更，需重新核对', description:'模型文件或对照资料已改变，旧核对记录仍保留；请按当前版本重新核对。' }
  if (decision?.valid === true) {
    if (decision.status === 'approved') return { key:'ready', label:'人工核对通过', description:'当前版本已由有权限的核对人完成外形与接口对照，可查看核对依据和记录。' }
    if (decision.status === 'needs_fix') return { key:'pending', label:'需修正', description:'人工核对发现不一致，请查看具体问题，修正或替换模型后重新核对。' }
    if (decision.status === 'pending') return { key:'pending', label:'待核对', description:'资料不足或尚未完成核对，请补齐对照依据后继续核对。' }
  }
  const review = modelReview(url)
  if (review?.requiresReview) return { key: 'pending', label: '外形待核对', description: review.note || '当前资料不足以确认模型外形与接口，请核对或补齐厂家资料；仍可显式预览现有外形。' }
  if (review?.status === 'reference') return { key: 'pending', label: '外形待核对', description: '保存后会保留绑定，详情显示待核对提示，3D 库位使用定位标记；核对或替换模型后再展示外观。' }
  return { key: 'ready', label: '可观察', description: '保存绑定后可在备件详情和 3D 库位查看模型；示意外观与安装尺寸仍以厂家资料为准。' }
}

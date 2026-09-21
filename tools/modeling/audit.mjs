import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readLedger, reviewPart } from './ledger.mjs'
import { resolveEvidenceModel } from '../../spare-parts-web-release/src/utils/evidence-models.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const input = process.argv[2]
if (!input) throw new Error('用法：node tools/modeling/audit.mjs <全部备件CSV路径>')
const ledger = readLedger(input)
const records = ledger.records.map(part => {
  const result = reviewPart(part)
  const verified=resolveEvidenceModel(part)
  if(verified) Object.assign(result,{researchStatus:'已核对厂家外廓尺寸',quality:verified.quality,exactModel:null,dimensionModel:verified.id,sourceUrl:verified.sourceUrl})
  const url = `/models/categories/${result.family}.glb`
  return { ...result, candidateCategoryUrl:result.family && fs.existsSync(path.join(root, 'spare-parts-web-release/public', url)) ? url : null }
})
const summary = { total:records.length, uniqueCodes:new Set(records.map(p=>p.code)).size,
  missingBrand:records.filter(p=>!p.brand).length, missingSpec:records.filter(p=>!p.spec).length,
  missingCategory:records.filter(p=>!p.existingCategory).length,
  incompatibleCategory:records.filter(p=>p.issues.some(i=>/不符|错配/.test(i))).length,
  categoryCandidates:records.filter(p=>p.candidateCategoryUrl).length,
  noCategoryCandidate:records.filter(p=>!p.candidateCategoryUrl).length,
  verifiedExactModels:0, dimensionReferenceModels:records.filter(p=>p.dimensionModel).length,
  researchPending:records.filter(p=>!p.dimensionModel).length }
const dir = path.join(root, '.local/modeling')
fs.mkdirSync(dir,{recursive:true})
fs.writeFileSync(path.join(dir,'coverage.json'),JSON.stringify({sourceSha256:ledger.sha256,scope:'用户提供的全部车间清单；文件未含车间字段，不能独立核对车间完整性',summary,records},null,2))
console.log(JSON.stringify(summary,null,2))

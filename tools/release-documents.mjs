import fs from 'node:fs'
export const releaseDocuments=JSON.parse(fs.readFileSync(new URL('./release-documents.json',import.meta.url),'utf8'))
export function verifyReleaseDocuments(files,folder){
  const has=name=>files.has(`${folder}/${name}`)
  const consolidated=has('docs/OPERATIONS_CURRENT.md')
  const required=consolidated?releaseDocuments.filter(name=>name!=='APP_REMEDIATION_20261029.md'||has('server/src/ai-settings.js')).map(name=>'docs/'+name):['docs/OPENCLAW_MODEL_MATCHING.md']
  // Historical archives keep their original documentation contract.
  if(!consolidated&&has('server/src/ai-call-audit.js'))required.push(...['KNOWLEDGE_AGENT_REVIEW_20261018.md','ACCOUNT_STORAGE_REVIEW_20261018.md','TOOLBAR_CLEANUP_REVIEW_20261018.md','UI_SIMPLIFICATION_20261018.md'].map(n=>'docs/'+n))
  for(const name of required)if(!has(name))throw Error('Missing release documentation '+name)
  return {consolidated,documents:required.length}
}

// New V1.9.10 packages use the maintained QA/operations documents. Existing
// archives keep their original root-level visual-QA requirement.
export function verifyReleaseDesignQa(files, folder, version) {
  const legacyVersions = ['V1.9.5', 'V1.9.6', 'V1.9.7', 'V1.9.8', 'V1.9.9', 'V1.9.10']
  const consolidatedCurrent = version === 'V1.9.10' && files.has(`${folder}/docs/OPERATIONS_CURRENT.md`)
  const required = legacyVersions.includes(version) && !consolidatedCurrent
  if (consolidatedCurrent && !files.has(`${folder}/QA_${version}.md`)) throw Error('Missing release QA QA_' + version + '.md')
  if (required && !files.has(`${folder}/design-qa.md`)) throw Error('Missing ' + version + ' file design-qa.md')
  return { required }
}

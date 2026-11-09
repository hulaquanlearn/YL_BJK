import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {releaseDocuments,verifyReleaseDocuments,verifyReleaseDesignQa} from './release-documents.mjs'
const folder='release',files=names=>new Map(names.map(n=>[folder+'/'+n,Buffer.alloc(0)]))
test('current release includes every maintained document, nested attribution and reference',()=>{
 assert.equal(new Set(releaseDocuments).size,releaseDocuments.length)
 for(const name of releaseDocuments){assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'));assert.ok(fs.existsSync(new URL('../docs/'+name,import.meta.url)),name)}
 const archive=files(releaseDocuments.map(n=>'docs/'+n))
 assert.equal(verifyReleaseDocuments(archive,folder).consolidated,true)
 archive.delete(folder+'/docs/MODEL_PENDING_20261023.md')
 assert.throws(()=>verifyReleaseDocuments(archive,folder),/MODEL_PENDING/)
})
test('historical archives retain their documentation checks',()=>{
 const archive=files(['docs/OPENCLAW_MODEL_MATCHING.md'])
 assert.equal(verifyReleaseDocuments(archive,folder).consolidated,false)
 archive.set(folder+'/server/src/ai-call-audit.js',Buffer.alloc(0))
 assert.throws(()=>verifyReleaseDocuments(archive,folder),/KNOWLEDGE_AGENT_REVIEW/)
 for(const n of ['KNOWLEDGE_AGENT_REVIEW','ACCOUNT_STORAGE_REVIEW','TOOLBAR_CLEANUP_REVIEW','UI_SIMPLIFICATION'])archive.set(folder+'/docs/'+n+'_20261018.md',Buffer.alloc(0))
 assert.doesNotThrow(()=>verifyReleaseDocuments(archive,folder))
})
test('AI configuration releases require the remediation guide without invalidating prior consolidated archives',()=>{
 const archive=files(releaseDocuments.filter(n=>n!=='APP_REMEDIATION_20261029.md').map(n=>'docs/'+n))
 assert.doesNotThrow(()=>verifyReleaseDocuments(archive,folder))
 archive.set(folder+'/server/src/ai-settings.js',Buffer.alloc(0))
 assert.throws(()=>verifyReleaseDocuments(archive,folder),/APP_REMEDIATION/)
 archive.set(folder+'/docs/APP_REMEDIATION_20261029.md',Buffer.alloc(0))
 assert.doesNotThrow(()=>verifyReleaseDocuments(archive,folder))
})
test('new consolidated V1.9.10 packages do not depend on the historical root visual-QA artifact',()=>{
 const archive=files([...releaseDocuments.map(n=>'docs/'+n),'QA_V1.9.10.md'])
 assert.doesNotThrow(()=>verifyReleaseDocuments(archive,folder))
 assert.equal(verifyReleaseDesignQa(archive,folder,'V1.9.10').required,false)
 archive.delete(folder+'/QA_V1.9.10.md')
 assert.throws(()=>verifyReleaseDesignQa(archive,folder,'V1.9.10'),/QA_V1\.9\.10\.md/)
 archive.set(folder+'/QA_V1.9.10.md',Buffer.from('current QA'))
 // Removing the old artifact never makes the maintained QA contract optional.
 archive.delete(folder+'/docs/OPERATIONS_CURRENT.md')
 assert.throws(()=>verifyReleaseDesignQa(archive,folder,'V1.9.10'),/design-qa\.md/)
})
test('historical V1.9.5 through V1.9.10 archives still require their original visual-QA file',()=>{
 for(const version of ['V1.9.5','V1.9.6','V1.9.7','V1.9.8','V1.9.9','V1.9.10']){
  const archive=files([])
  assert.throws(()=>verifyReleaseDesignQa(archive,folder,version),/design-qa\.md/,version)
  archive.set(folder+'/design-qa.md',Buffer.from('original archived visual QA'))
  assert.equal(verifyReleaseDesignQa(archive,folder,version).required,true,version)
 }
 const oldVersion=files(['docs/OPERATIONS_CURRENT.md'])
 assert.throws(()=>verifyReleaseDesignQa(oldVersion,folder,'V1.9.9'),/design-qa\.md/)
})

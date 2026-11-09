import test from 'node:test'
import assert from 'node:assert/strict'
import {spareDocumentQuery,safeReferenceUrl,spareDocumentFamilies,spareDocumentKinds} from '../src/utils/spare-documents.mjs'
import backend from '../../server/src/knowledge-reference.js'

test('document classification stays aligned across upload, search and display',()=>{
 assert.deepEqual(spareDocumentFamilies,backend.FAMILIES)
 assert.deepEqual(spareDocumentKinds,backend.KINDS)
 assert.equal(safeReferenceUrl('javascript:alert(1)'), '')
 assert.equal(safeReferenceUrl('https://token:secret@example.com/manual.pdf'), '')
 assert.equal(safeReferenceUrl('https://www.airtac.com/manual.pdf'),'https://www.airtac.com/manual.pdf')
})

test('part links carry a model search into the existing knowledge library',()=>{
 assert.deepEqual(spareDocumentQuery({spec:'带座轴承,UCP308,立式座'}),{path:'/knowledge',query:{library:'parts',search:'UCP308'}})
 assert.equal(spareDocumentQuery({spec:'SC40×100'}).query.search,'SC40')
 assert.equal(spareDocumentQuery({spec:'6006-2Z'}).query.search,'6006-2Z')
 assert.deepEqual(spareDocumentQuery({name:'特殊制作件'}),{path:'/knowledge',query:{library:'parts'}})
})

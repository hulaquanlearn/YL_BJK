import test from 'node:test'
import assert from 'node:assert/strict'
import {catalogRuleDraft,ruleDraftProblems,groupRuleDraft} from '../src/utils/work-rule-draft.mjs'
const duties=[{id:'a',title:'生产工作',evidence:'生产表',active:true,frequency:'每日'},{id:'b',title:'新工作',evidence:'验证表',frequency:'每周'},{id:'off',title:'已停用',active:false}]
test('initial catalog generates complete editable list without inventing points',()=>{
 const draft=catalogRuleDraft(duties);assert.deepEqual(draft.map(r=>r.dutyId),['a','b']);assert.ok(draft.every(r=>r.max===''&&r.standard));assert.ok(ruleDraftProblems(draft,duties).some(s=>s.includes('分值')))
})
test('saved selection preserves deletion and points on reopening',()=>{
 const draft=catalogRuleDraft(duties,[{dutyId:'a',max:25,standard:'人工维护的标准',kind:'manual',bonusPerClosure:0.5}]);assert.equal(draft.length,1);assert.equal(draft[0].standard,'人工维护的标准');assert.deepEqual(ruleDraftProblems(draft,duties,'7'),[])
})
test('custom item and standard persist and validate independently',()=>{
 const item={custom:true,customId:'custom_one',title:'新事项',kind:'manual',max:25,standard:'完成要求满分',bonusPerClosure:0};const draft=catalogRuleDraft(duties,[item]);assert.equal(draft[0].customId,item.customId);assert.deepEqual(ruleDraftProblems(draft,duties,'7'),[]);draft[0].title='';assert.ok(ruleDraftProblems(draft,duties,'7').length);draft[0].title='新事项';draft[0].standard='';assert.ok(ruleDraftProblems(draft,duties,'7').some(s=>s.includes('评判标准')))
})
test('missing points and incomplete totals explain save requirements',()=>{
 const draft=catalogRuleDraft(duties);draft[0].max=2;assert.ok(ruleDraftProblems(draft,duties,'7').some(s=>s.includes('分值未填写')));draft[1].max=0;assert.ok(ruleDraftProblems(draft,duties,'7').some(s=>s.includes('当前 2 分')))
})

test('category groups preserve original indices and references across deletion and regrouping',()=>{
 const catalog=[{id:'a',category:'基础工作'},{id:'b',category:'质量管理'},{id:'c',category:'基础工作'}];const draft=[{dutyId:'b',max:4},{dutyId:'a',max:2},{custom:true,customId:'custom_a',category:'安全',max:''},{dutyId:'c',max:3}];let groups=groupRuleDraft(draft,catalog);assert.deepEqual(groups.map(g=>g.category),['基础工作','质量管理','安全']);assert.equal(groups[0].total,5);assert.deepEqual(groups[0].items.map(x=>x.index),[1,3]);groups[0].items[0].rule.max=4;assert.equal(draft[1].max,4);draft.splice(groups[0].items[1].index,1);groups=groupRuleDraft(draft,catalog);assert.equal(groups[0].items.length,1);assert.equal(groups[2].unfilled,1);assert.equal(draft[0].dutyId,'b')
})

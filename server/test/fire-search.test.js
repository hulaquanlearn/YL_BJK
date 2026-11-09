const test = require('node:test');
const assert = require('node:assert/strict');
const {searchPoints} = require('../src/fire-store');
const points = [{id:1,areaId:2,location:'北门',assets:[{id:11,code:'005',type:'extinguisher'},{id:12,code:'006',type:'extinguisher'}]}, {id:2,areaId:2,location:'005号通道',assets:[{id:21,code:'105',type:'extinguisher'}]}, {id:3,areaId:9,location:'西门',assets:[{id:31,code:'005',type:'hydrant'}]}];
test('exact codes exclude siblings and incidental location matches, retaining point snapshots',()=>{
 const result=searchPoints(points,{q:' ００５ ',type:'extinguisher'});
 assert.deepEqual(result.map(p=>[p.id,p.matchedAssetIds]),[[1,[11]]]);
 assert.equal(result[0].assets.length,2);
 assert.deepEqual(searchPoints(points,{q:'005'}).map(p=>p.matchedAssetIds),[[11],[31]]);
});
test('partial code and location searches return only matching assets within selected scope',()=>{
 assert.deepEqual(searchPoints(points,{q:'06'}).map(p=>p.matchedAssetIds),[[12]]);
 assert.deepEqual(searchPoints(points,{q:'北门'}).map(p=>p.matchedAssetIds),[[11,12]]);
 assert.deepEqual(searchPoints(points,{q:'005',areaId:9}).map(p=>p.matchedAssetIds),[[31]]);
 assert.deepEqual(searchPoints(points,{q:'absent'}),[]);
});

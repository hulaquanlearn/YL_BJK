import test from 'node:test'
import assert from 'node:assert/strict'
import {toolDrive,toolGuardOpen} from '../src/utils/abb-tool-drive.mjs'
test('belt and rotor honor independent source directions and combined spreading enable',()=>{
 assert.deepEqual(toolDrive(null),{belt:0,rotor:0,speed:1,rotorSpeed:1})
 assert.deepEqual(toolDrive({signals:{do22_boji_zz_dk:1}}),{belt:1,rotor:1,speed:1,rotorSpeed:1})
 assert.deepEqual(toolDrive({signals:{do18_pidai_zhengzhuan:1}}),{belt:1,rotor:0,speed:1,rotorSpeed:1})
 assert.deepEqual(toolDrive({signals:{do19_pidai_fanzhuan:1,do22_boji_zz_dk:1}}),{belt:-1,rotor:1,speed:1,rotorSpeed:1})
 assert.deepEqual(toolDrive({signals:{do18_pidai_zhengzhuan:1,do19_pidai_fanzhuan:1}}),{belt:0,rotor:0,speed:1,rotorSpeed:1})
 assert.equal(toolDrive({signals:{go32_47_boqi_zhuansu:500}}).speed,.5)
 assert.equal(toolDrive({signals:{go32_47_boqi_zhuansu:0}}).speed,0)
})

test("belt and scatter use their own GO speeds, including a stationary belt and running rotor",()=>{const drive=toolDrive({signals:{do22_boji_zz_dk:1,go32_47_boqi_zhuansu:0,go48_63_dasan_zhuansu:2400}});assert.equal(drive.speed,0);assert.equal(drive.rotorSpeed,2.4);assert.equal(drive.rotor,1)})

test('offline receiving closes the bucket guard and stops drives without rewriting source requests',()=>{
 const signals={do16_dakai_huzhao:1,do22_boji_zz_dk:1,do99_bopi_zhuangliao:1},cell={profile:'brewing-cell@1',bucketVolume:.09,signals}
 assert.equal(toolGuardOpen(cell),0);assert.equal(toolDrive(cell).belt,0);assert.equal(toolDrive(cell).rotor,0);assert.equal(signals.do16_dakai_huzhao,1)
 signals.do99_bopi_zhuangliao=0;assert.equal(toolGuardOpen(cell),1);assert.equal(toolDrive(cell).belt,1);cell.bucketVolume=0;assert.equal(toolGuardOpen(cell),0);assert.equal(toolDrive(cell).rotor,0)
 assert.equal(toolGuardOpen(null,{do16_dakai_huzhao:1}),1,'non-automatic routines keep the source guard request')
})

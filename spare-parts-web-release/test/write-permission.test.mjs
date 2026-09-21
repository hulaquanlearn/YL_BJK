import test from 'node:test'
import assert from 'node:assert/strict'
import {createWritePermissionDirective,isBusinessWrite,PERMISSION_MESSAGE} from '../src/utils/write-permission.mjs'

test('visible write controls block clicks and file drops for viewers, permit editors, and remove their listeners',()=>{
  let viewer=true;const notices=[],attributes={};const target=new EventTarget();target.setAttribute=(key,value)=>attributes[key]=value;
  const directive=createWritePermissionDirective(()=>viewer,message=>notices.push(message));directive.mounted(target);
  let effects=0;target.addEventListener('click',()=>effects++);
  const click=new Event('click',{cancelable:true});target.dispatchEvent(click);assert.equal(click.defaultPrevented,true);assert.equal(effects,0);assert.deepEqual(notices,[PERMISSION_MESSAGE]);
  const drop=new Event('drop',{cancelable:true});target.dispatchEvent(drop);assert.equal(drop.defaultPrevented,true);
  viewer=false;target.dispatchEvent(new Event('click'));assert.equal(effects,1);
  directive.unmounted(target);viewer=true;target.dispatchEvent(new Event('click'));assert.equal(effects,2);
  assert.ok(Object.hasOwn(attributes,'data-write-action'));
})

test('request boundary permits reads, questions and own session actions, but blocks business writes regardless of endpoint',()=>{
  for(const [method,url] of [['GET','/users'],['GET','/knowledge/1/download'],['POST','/ai/chat'],['POST','/auth/logout'],['POST','/auth/change-password'],['POST','/plc/projects/1/analyze']])assert.equal(isBusinessWrite(method,url),false,url)
  for(const [method,url] of [['POST','/parts'],['PATCH','/users/1'],['DELETE','/knowledge/1'],['POST','/parts/import'],['POST','/plc/projects/1/analyze/other'],['POST','/inventory-orders/1/approve']])assert.equal(isBusinessWrite(method,url),true,url)
})

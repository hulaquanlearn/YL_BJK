import test from 'node:test'
import assert from 'node:assert/strict'
import {modelRequestFailure} from '../src/utils/model-request-failure.mjs'
test('request diagnostics expose only the allowlisted fields and redact credentials before truncation',()=>{
 const logs=[],token='private-token-123',error=Object.assign(Error(`Network Error Bearer ${token} token=${token} password=hidden ${'x'.repeat(400)}`),{name:'AxiosError',code:'ERR_NETWORK',config:{headers:{Authorization:`Bearer ${token}`}},response:{status:502,data:{msg:'服务暂不可用',token,rows:['business-body']}}})
 const message=modelRequestFailure(error,{scope:'model-catalog',label:'模型目录',logger:(...args)=>logs.push(args)})
 assert.equal(message,'服务暂不可用');assert.equal(logs.length,1)
 assert.deepEqual(Object.keys(logs[0][1]),['scope','name','code','message','status','dataType'])
 assert.equal(logs[0][1].status,502);assert.equal(logs[0][1].dataType,'object');assert.ok(logs[0][1].message.length<=220)
 assert.doesNotMatch(JSON.stringify(logs),/private-token|hidden|business-body|headers|config/)
})
test('timeout, offline, data conversion and backend messages give distinct actionable feedback',()=>{
 const opts={scope:'associated-parts',label:'关联备件',logger:()=>{}}
 assert.match(modelRequestFailure({code:'ECONNABORTED'},opts),/读取超时/)
 assert.match(modelRequestFailure({code:'ERR_NETWORK'},opts),/网络连接失败/)
 assert.match(modelRequestFailure(TypeError('invalid rows'),{...opts,phase:'data'}),/数据处理失败/)
 assert.equal(modelRequestFailure({response:{status:403,data:{msg:'仅限管理人员'}}},opts),'仅限管理人员')
 assert.doesNotMatch(modelRequestFailure({response:{data:{msg:'token=secret-value'}}},opts),/secret-value/)
})

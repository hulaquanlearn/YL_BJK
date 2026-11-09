const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
test('profile updates and session refresh retain current independent fire grants', async () => {
 const routes = new Map(), router = {};
 for (const method of ['get','post','patch']) router[method] = (url,...handlers) => routes.set(method + ':' + url, handlers.at(-1));
 let grants = { canRead:true,canManage:false,areaIds:[7] }, updates = 0;
 const pool = { query:async () => { updates++; return [{affectedRows:1}]; } };
 const mocks = {
  express:{Router:()=>router},'express-rate-limit':()=>()=>{},'../db':{pool},
  '../utils':require('../src/utils'),'../auth':{requireAuth(){},publicUser:value=>value,createSession(){},setAssetCookie(){},clearAssetCookie(){}},
  '../fire-access':{loadFireAccess:async(user,connection)=>{assert.equal(user.id,'11');assert.equal(connection,pool);return grants}},
  '../password-policy':{validatePassword:value=>value},'../password':{},'../personal-profile':require('../src/personal-profile')
 };
 const context = vm.createContext({require:name=>{if(!(name in mocks))throw Error('Unexpected dependency '+name);return mocks[name]},module:{exports:{}},console});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/routes/auth.js'),'utf8'),context);
 const user={id:'11',role:'viewer',displayName:'原姓名'};
 async function invoke(key,body){let result;await routes.get(key)({user,body}, {json:value=>{result=value}}, error=>{throw error});return result.data.user;}
 const profile=await invoke('patch:/profile',{displayName:'新姓名'});assert.equal(profile.displayName,'新姓名');assert.equal(profile.fireAccess,grants);assert.equal(updates,1);
 assert.equal((await invoke('get:/me')).fireAccess,grants);
 grants={canRead:false,canManage:false,areaIds:[]};assert.equal((await invoke('get:/me')).fireAccess.canRead,false);
});

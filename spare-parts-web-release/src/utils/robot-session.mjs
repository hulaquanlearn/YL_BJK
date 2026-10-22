// Local browser only. One latest backup per authenticated account; no keys stored.
const DB='robot-program-local-v1',STORE='sessions'
function open(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
export async function robotSession(accountId,action,value){
 if(!accountId)throw new Error('账号未确认，未保存程序')
 const db=await open()
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,action==='get'?'readonly':'readwrite'),store=tx.objectStore(STORE);const req=action==='get'?store.get(String(accountId)):action==='delete'?store.delete(String(accountId)):store.put({...value,schema:1},String(accountId));let result;req.onsuccess=()=>{result=req.result};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||new Error('本地保存失败'));tx.onerror=()=>reject(tx.error)})}finally{db.close()}
}

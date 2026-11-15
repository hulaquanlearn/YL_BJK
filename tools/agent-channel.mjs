import {readFile,writeFile,mkdir,rename,realpath,readdir,access} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const actors=new Set(['codex','dsh'])
const safeId=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,139}$/
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const exists=async p=>{try{await access(p);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}
function actor(v){if(!actors.has(v))throw new Error('Actor must be codex or dsh');return v}
function id(v){if(typeof v!=='string'||!safeId.test(v))throw new Error('Invalid message/task ID');return v}
async function atomicJson(filename,value){
 const temp=filename+'.'+randomUUID()+'.tmp'
 await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'})
 await rename(temp,filename)
}
export async function openChannel(workspace){
 const root=await realpath(workspace),home=path.join(root,'.local','agent-channel')
 await mkdir(home,{recursive:true})
 // Resolve the physical directory too: a planted junction must not redirect it.
 const physical=await realpath(home)
 if(path.relative(root,physical).startsWith('..')||path.isAbsolute(path.relative(root,physical)))throw new Error('Channel is outside workspace')
 const projectId=createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,20)
 const configPath=path.join(home,'channel.json'),config={schema:1,workspace:root,projectId,actors:[...actors]}
 try{await writeFile(configPath,JSON.stringify(config,null,2)+'\n',{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e}
 const saved=JSON.parse(await readFile(configPath,'utf8'))
 if(saved.workspace!==root||saved.projectId!==projectId||saved.schema!==1)throw new Error('Project channel identity mismatch')
 for(const a of actors)for(const dir of ['inbox','receipts'])await mkdir(path.join(home,dir,a),{recursive:true})
 async function load(as,messageId){
  actor(as);id(messageId)
  const m=JSON.parse(await readFile(path.join(home,'inbox',as,messageId+'.json'),'utf8'))
  if(m.projectId!==projectId||m.to!==as||m.id!==messageId)throw new Error('Message project/recipient mismatch')
  actor(m.from);id(m.task)
  return m
 }
 async function send({from,to,task,subject,body,replyTo}){
  actor(from);actor(to);id(task)
  if(from===to)throw new Error('Sender and recipient must differ')
  if(typeof subject!=='string'||!subject.trim()||subject.length>240)throw new Error('Subject must contain 1–240 characters')
  if(typeof body!=='string'||!body.trim()||Buffer.byteLength(body,'utf8')>65536)throw new Error('Body must contain 1–65536 UTF-8 bytes')
  if(replyTo){const prior=await load(from,replyTo);if(prior.from!==to||prior.task!==task)throw new Error('Reply recipient/task mismatch')}
  const messageId=Date.now()+'-'+randomUUID(),message={schema:1,projectId,id:messageId,task,from,to,subject,body,createdAt:new Date().toISOString(),...(replyTo?{replyTo}:{} )}
  await atomicJson(path.join(home,'inbox',to,messageId+'.json'),message)
  return message
 }
 async function list(as,{task,all=false}={}){
  actor(as);if(task)id(task)
  const files=(await readdir(path.join(home,'inbox',as))).filter(p=>p.endsWith('.json')).sort(),result=[]
  for(const filename of files){
   const messageId=filename.slice(0,-5),m=await load(as,messageId)
   if(task&&m.task!==task)continue
   const receipt=path.join(home,'receipts',as,messageId+'.json'),acknowledged=await exists(receipt)
   if(all||!acknowledged)result.push({...m,acknowledged})
  }
  return result
 }
 async function ack(as,messageId,note=''){
  const m=await load(as,messageId),filename=path.join(home,'receipts',as,messageId+'.json')
  const receipt={schema:1,projectId,id:m.id,task:m.task,from:m.from,to:as,receivedAt:new Date().toISOString(),note:String(note).slice(0,2000)}
  // Exclusive receipt creation is idempotent. Never replace a peer's receipt.
  try{await writeFile(filename,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});return receipt}catch(e){if(e.code!=='EEXIST')throw e;return JSON.parse(await readFile(filename,'utf8'))}
 }
 async function status(){
  const result={...config,home,pending:{},total:{}}
  for(const a of actors){result.pending[a]=(await list(a)).length;result.total[a]=(await list(a,{all:true})).length}
  return result
 }
 async function wait(as,{task,timeoutMs=50000}={}){
  if(!Number.isFinite(timeoutMs)||timeoutMs<0||timeoutMs>55000)throw new Error('Wait timeout must be 0–55000ms')
  const end=Date.now()+timeoutMs
  for(;;){const messages=await list(as,{task});if(messages.length||Date.now()>=end)return messages;await pause(Math.min(500,end-Date.now()))}
 }
 return {send,list,ack,status,wait,load}
}

async function main(){
 const [command,...args]=process.argv.slice(2),opts={}
 for(let i=0;i<args.length;i++){const key=args[i];if(!/^--[a-z-]+$/.test(key))throw new Error('Expected named option');if(key==='--all'){opts.all=true;continue}if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing value for '+key);opts[key.slice(2)]=args[++i]}
 if(!['status','send','read','ack','wait','show'].includes(command))throw new Error('Usage: node tools/agent-channel.mjs status|send|read|ack|wait|show [--as codex|dsh] [--task ID] [--body-file PATH]')
 const channel=await openChannel(fileURLToPath(new URL('../',import.meta.url)))
 let result
 if(command==='status')result=await channel.status()
 else if(command==='send')result=await channel.send({from:opts.from,to:opts.to,task:opts.task,subject:opts.subject,body:opts['body-file']?await readFile(opts['body-file'],'utf8'):opts.body,replyTo:opts['reply-to']})
 else if(command==='read')result=await channel.list(opts.as,{task:opts.task,all:opts.all})
 else if(command==='show')result=await channel.load(opts.as,opts.id)
 else if(command==='ack')result=await channel.ack(opts.as,opts.id,opts.note)
 else result=await channel.wait(opts.as,{task:opts.task,timeoutMs:opts['timeout-ms']===undefined?50000:Number(opts['timeout-ms'])})
 console.log(JSON.stringify(result,null,2))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('agent-channel:',e.message);process.exitCode=1})

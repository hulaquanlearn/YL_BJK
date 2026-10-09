const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const sharp=require('sharp');
const utils=require('../src/utils');

function harness(query,options={}){
  const handlers=new Map(),middleware=[];
  const router={use:fn=>middleware.push(fn)};
  for(const verb of ['get','post','patch'])router[verb]=(url,...chain)=>handlers.set(`${verb} ${url}`,chain.at(-1));
  const db={query,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}};
  const multer=()=>({array:()=>()=>{}});multer.memoryStorage=()=>({});
  const dependencies={express:{Router:()=>router},multer,sharp,crypto:require('node:crypto'),path,'../db':{pool:{query,getConnection:async()=>db}},'../config':options.config||{openclaw:{contextTransferEnabled:false}},'../utils':{...utils,asyncHandler:fn=>fn},'../workshop-scope':require('../src/workshop-scope'),'../data-protection':require('../src/data-protection'),'../inspection-notice':require('../src/inspection-notice'),'../inspection-vision':require('../src/inspection-vision'),'../inspection-export':require('../src/inspection-export')};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/routes/inspection-notices.js'),'utf8'),{require:name=>dependencies[name],module:{exports:{}},Buffer,Date,AbortController,setTimeout,clearTimeout,fetch:options.fetch});
  return {handlers,middleware};
}
const report={id:1,workshop_code:'raw_grain',revision:0,header_json:{title:'检查通报'},issues_json:[]};
const actor={id:2,role:'raw_grain'};
const capture=()=>{let value;return {res:{json(body){value=body;return body}},value:()=>value}};

test('only managers can use inspection routes; other-workshop staff cannot read source bytes',async()=>{
  let sourceRead=false;
  const {handlers,middleware}=harness(async sql=>{
    if(sql.startsWith('SELECT * FROM inspection_notices'))return [[report]];
    if(sql.includes('SELECT mime,image'))sourceRead=true;
    throw Error('Unexpected SQL '+sql);
  });
  let denial;middleware[0]({user:{role:'viewer'}},null,error=>denial=error);
  assert.equal(denial.status,403);
  let allowed;middleware[0]({user:actor},null,error=>allowed=error);
  assert.equal(allowed,undefined);
  await assert.rejects(()=>handlers.get('get /reports/:id/sources/:sourceId/image')({user:{id:3,role:'viewer',staffWorkshopCode:'qu_making'},params:{id:'1',sourceId:'11'}},{}),{status:403});
  assert.equal(sourceRead,false);
});

test('report history paginates and remains limited to raw-grain even for an administrator',async()=>{
  const queries=[];
  const {handlers}=harness(async(sql,args)=>{
    queries.push({sql,args});
    if(sql.startsWith('SELECT COUNT(*) AS total'))return [[{total:121}]];
    if(sql.startsWith('SELECT id,workshop_code'))return [[{id:75,workshop_code:'raw_grain',owner_id:2,header_json:{title:'第三周通报'},revision:1,source_count:2}]];
    throw Error('Unexpected SQL '+sql);
  });
  const reply=capture();
  await handlers.get('get /reports')({user:{id:1,role:'admin'},query:{page:'4',pageSize:'20',title:'第三周'}},reply.res);
  assert.equal(reply.value().data.total,121);
  assert.equal(reply.value().data.items[0].title,'第三周通报');
  assert.deepEqual(Array.from(queries[1].args.slice(-2)),[20,60]);
  assert.match(queries[0].sql,/n\.workshop_code=\?/);
  assert.equal(queries[0].args[0],'raw_grain');
  await assert.rejects(()=>handlers.get('get /reports')({user:{id:1,role:'admin'},query:{workshopCode:'qu_making'}},{}),{status:400});
});

test('failed upload retry skips an already-saved hash without adding a duplicate',async()=>{
  const image=await sharp({create:{width:200,height:200,channels:3,background:'#69a'}}).png().toBuffer();
  const sha=require('node:crypto').createHash('sha256').update(image).digest('hex');
  let inserts=0,updates=0;
  const {handlers}=harness(async sql=>{
    if(sql.startsWith('SELECT * FROM inspection_notices'))return [[report]];
    if(sql.startsWith('SELECT id,sha256,byte_size'))return [[{id:11,sha256:sha,byte_size:image.length}]];
    if(sql.startsWith('SELECT code FROM workshops'))return [[{code:'raw_grain'}]];
    if(sql.startsWith('SELECT COALESCE(SUM(s.byte_size)'))return [[{bytes:image.length}]];
    if(sql.startsWith('INSERT INTO inspection_events'))return [{insertId:1}];
    if(sql.startsWith('INSERT INTO inspection_sources')){inserts++;return [{insertId:12}]}
    if(sql.startsWith('UPDATE inspection_notices')){updates++;return [{}]}
    throw Error('Unexpected SQL '+sql);
  });
  const h=handlers.get('post /reports/:id/sources');
  const retry=capture();await h({user:actor,params:{id:'1'},body:{retry:'1'},files:[{buffer:image,originalname:'重复.png'}]},retry.res);
  assert.equal(inserts,0);assert.equal(updates,0);assert.equal(retry.value().data.skipped.length,1);
  const ordinary=capture();await h({user:actor,params:{id:'1'},body:{},files:[{buffer:image,originalname:'重叠.png'}]},ordinary.res);
  assert.equal(inserts,1);assert.equal(ordinary.value().data.added[0].duplicateOf,11);
});

test('vision unavailable reports a real failure and preserves previous issues',async()=>{
  let issueUpdate=false,status='pending',marker;const image=await sharp({create:{width:200,height:200,channels:3,background:'#69a'}}).png().toBuffer();
  const source={id:11,notice_id:1,status:'pending',image};
  const config={openclaw:{contextTransferEnabled:true,apiUrl:'http://127.0.0.1:14504/v1/chat/completions',token:'test-token',visionModel:'test-vision',timeoutMs:1000}};
  const {handlers}=harness(async (sql,args)=>{
    if(sql.startsWith('SELECT * FROM inspection_notices'))return [[report]];
    if(sql.startsWith('SELECT id,notice_id,filename'))return [[{id:11,status}]];
    if(sql.includes('SELECT id,status')&&sql.includes('inspection_sources'))return [[{id:11,status}]];
    if(sql.startsWith('UPDATE inspection_sources SET status=\'processing')){status='processing';marker=args[0];return [{}]}
    if(sql.startsWith('SELECT id,image'))return [[source]];
    if(sql.startsWith('UPDATE inspection_sources SET status=\'failed')){status='failed';return [{}]}
    if(sql.startsWith('UPDATE inspection_notices SET issues_json'))issueUpdate=true;
    throw Error('Unexpected SQL '+sql);
  },{config,fetch:async()=>({ok:false,status:400})});
  const result=capture();await handlers.get('post /reports/:id/analyze')({user:actor,params:{id:'1'},body:{sourceIds:[11]}},result.res);
  assert.equal(result.value().data.available,false);
  assert.match(result.value().data.reason,/无法处理图片请求/);
  assert.equal(status,'failed');assert.equal(issueUpdate,false);
});

test('empty vision result is a failed source, not a successful blank notice',async()=>{
  const image=await sharp({create:{width:200,height:200,channels:3,background:'#69a'}}).png().toBuffer();
  let status='pending',marker,savedIssues=false;
  const config={openclaw:{contextTransferEnabled:true,apiUrl:'http://127.0.0.1:14504/v1/chat/completions',token:'test-token',visionModel:'test-vision',timeoutMs:1000}};
  const {handlers}=harness(async(sql,args)=>{
    if(sql.startsWith('SELECT * FROM inspection_notices'))return [[report]];
    if(sql.startsWith('SELECT id,notice_id,filename'))return [[{id:11,status,duplicate_of:null}]];
    if(sql.includes('SELECT id,status')&&sql.includes('inspection_sources'))return [[{id:11,status,error_message:marker}]];
    if(sql.startsWith("UPDATE inspection_sources SET status='processing")){status='processing';marker=args[0];return [{}]}
    if(sql.startsWith('SELECT id,image'))return [[{id:11,image}]];
    if(sql.startsWith("UPDATE inspection_sources SET status='failed")){status='failed';return [{}]}
    if(sql.startsWith('UPDATE inspection_notices SET issues_json'))savedIssues=true;
    throw Error('Unexpected SQL '+sql);
  },{config,fetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"issues":[]}'}}]})})});
  const reply=capture();await handlers.get('post /reports/:id/analyze')({user:actor,params:{id:'1'},body:{sourceIds:[11]}},reply.res);
  assert.equal(reply.value().data.available,false);
  assert.match(reply.value().data.reason,/没有识别出可核对的问题/);
  assert.equal(status,'failed');assert.equal(savedIssues,false);
});

test('vision timeout also aborts a stalled response body and leaves no appended issues',async()=>{
  const image=await sharp({create:{width:200,height:200,channels:3,background:'#69a'}}).png().toBuffer();
  let status='pending',marker,savedIssues=false;
  const config={openclaw:{contextTransferEnabled:true,apiUrl:'http://127.0.0.1:14504/v1/chat/completions',token:'test-token',visionModel:'test-vision',timeoutMs:40}};
  const {handlers}=harness(async(sql,args)=>{
    if(sql.startsWith('SELECT * FROM inspection_notices'))return [[report]];
    if(sql.startsWith('SELECT id,notice_id,filename'))return [[{id:11,status}]];
    if(sql.includes('SELECT id,status')&&sql.includes('inspection_sources'))return [[{id:11,status}]];
    if(sql.startsWith("UPDATE inspection_sources SET status='processing")){status='processing';marker=args[0];return [{}]}
    if(sql.startsWith('SELECT id,image'))return [[{id:11,image}]];
    if(sql.startsWith("UPDATE inspection_sources SET status='failed")){assert.equal(args.at(-1),marker);status='failed';return [{}]}
    if(sql.startsWith('UPDATE inspection_notices SET issues_json'))savedIssues=true;
    throw Error('Unexpected SQL '+sql);
  },{config,fetch:async(_url,options)=>({ok:true,headers:{get:()=>null},body:new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(new DOMException('aborted','AbortError')),{once:true})}})})});
  const reply=capture();await handlers.get('post /reports/:id/analyze')({user:actor,params:{id:'1'},body:{sourceIds:[11]}},reply.res);
  assert.equal(reply.value().data.available,false);
  assert.match(reply.value().data.reason,/超时/);
  assert.equal(status,'failed');assert.equal(savedIssues,false);
});

test('later screenshot can pair with a previous different-person photo without overwriting manual edits',async()=>{
  const image=await sharp({create:{width:200,height:200,channels:3,background:'#69a'}}).png().toBuffer();
  const old={id:'manual-1',origin:'manual',segment:'五粮破碎工段',problem:'已由人工核对的旧问题',reviewStatus:'confirmed',sourceIds:[11],photos:[]};
  const stored={...report,issues_json:[old]};let sourceStatus='failed',savedIssues,requestBody,marker;
  const config={openclaw:{contextTransferEnabled:true,apiUrl:'http://127.0.0.1:14504/v1/chat/completions',token:'test-token',visionModel:'test-vision',timeoutMs:1000}};
  const {handlers}=harness(async(sql,args)=>{
    if(sql.startsWith('SELECT * FROM inspection_notices'))return [[stored]];
    if(sql.startsWith('SELECT id,notice_id,filename'))return [[{id:11,status:'done'},{id:12,status:sourceStatus}]];
    if(sql.includes('SELECT id,status')&&sql.includes('inspection_sources'))return [[{id:12,status:sourceStatus,error_message:marker}]];
    if(sql.startsWith('UPDATE inspection_sources SET status=\'processing')){sourceStatus='processing';marker=args[0];return [{}]}
    if(sql.startsWith('SELECT id,image'))return [[{id:11,image},{id:12,image}]];
    if(sql.startsWith('UPDATE inspection_notices SET issues_json')){savedIssues=JSON.parse(args[0]);return [{}]}
    if(sql.startsWith('INSERT INTO inspection_events'))return [{insertId:1}];
    if(sql.startsWith('UPDATE inspection_sources SET status=\'done')){sourceStatus='done';return [{}]}
    throw Error('Unexpected SQL '+sql);
  },{config,fetch:async(_url,options)=>{
    requestBody=JSON.parse(options.body);
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({issues:[{segment:'五粮破碎工段',problem:'后来补充的设备问题',sourceIds:[11,12],photos:[{sourceId:11,rect:{x:.1,y:.1,w:.4,h:.4}},{sourceId:12,rect:{x:.2,y:.2,w:.3,h:.3}}],pairingReason:'位置与设备编号一致'}]})}}]})};
  }});
  const result=capture();await handlers.get('post /reports/:id/analyze')({user:actor,params:{id:'1'},body:{sourceIds:[12]}},result.res);
  assert.equal(result.value().data.available,true);assert.equal(sourceStatus,'done');
  assert.equal(requestBody.messages[1].content.filter(item=>item.type==='image_url').length,2);
  assert.equal(savedIssues.length,2);assert.deepEqual(savedIssues[0],old);
  assert.deepEqual(savedIssues[1].photos.map(photo=>photo.sourceId),[11,12]);
  assert.equal(savedIssues[1].reviewStatus,'pending');
});

test('real app rejects anonymous upload, image and export before database access',async()=>{
  const app=require('../src/app'),server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try{
    for(const [method,url] of [['POST','/reports/1/sources'],['GET','/reports/1/sources/11/image'],['GET','/reports/1/export']]){
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api/inspection-notices${url}`,{method});
      assert.equal(response.status,401,method+' '+url);
      assert.match(response.headers.get('cache-control'),/no-store/);
    }
  }finally{await new Promise(resolve=>server.close(resolve));await require('../src/db').pool.end()}
});

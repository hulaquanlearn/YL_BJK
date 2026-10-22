// Synthetic account persistence for local review and production-route HTTP tests.
// Never mounted by app.js and never connects to a database.
function usersQuery(users,accounts={}){
 const sessions=[];
 for(const u of users){u.username=Object.keys(accounts).find(key=>accounts[key]===u.id)||u.username||'sample_'+u.id;u.displayName=u.name||u.displayName;u.enabled=u.enabled??true}
 async function query(sql,args=[]){
  const s=sql.replace(/\s+/g,' ').trim();
  if(s.startsWith('SELECT id, username, display_name'))return [users.filter(u=>!s.includes("WHERE role='viewer'")||u.role==='viewer'&&u.staffWorkshopCode===args[0]).map(({passwordHash,name,...u})=>({...u}))];
  if(s.startsWith('SELECT role, staff_workshop_code')||s.startsWith('SELECT role,staff_workshop_code'))return [users.filter(u=>String(u.id)===String(args[0])).map(u=>({role:u.role,staff_workshop_code:u.staffWorkshopCode,staff_position:u.staffPosition}))];
  if(s.startsWith('INSERT INTO app_users')){
   if(users.some(u=>u.username===args[0]))throw Object.assign(new Error('Duplicate fixture username'),{code:'ER_DUP_ENTRY'});
   const id=Math.max(0,...users.map(u=>u.id))+1;users.push({id,username:args[0],passwordHash:args[1],displayName:args[2],name:args[2],role:args[3],staffWorkshopCode:args[4],staffPosition:args[5],enabled:true});accounts[args[0]]=id;return [{insertId:id}];
  }
  if(s.startsWith('UPDATE app_users')){
   const scoped=s.includes("AND role='viewer'"),id=s.includes('password_hash = ?')?args[1]:args.at(scoped?-2:-1),u=users.find(u=>String(u.id)===String(id));
   if(!u)return [{affectedRows:0}];
   if(scoped&&(u.role!=='viewer'||u.staffWorkshopCode!==args.at(-1)))return [{affectedRows:0}];
   let n=0;const set=s.slice(s.indexOf(' SET ')+5,s.indexOf(' WHERE '));
   const names={display_name:'displayName',role:'role',staff_workshop_code:'staffWorkshopCode',staff_position:'staffPosition',enabled:'enabled',password_hash:'passwordHash'};
   for(const column of set.split(',')){const m=column.trim().match(/^(\w+)\s*=\s*\?$/);if(m){u[names[m[1]]]=args[n++];if(m[1]==='display_name')u.name=u.displayName}}
   return [{affectedRows:1}];
  }
  if(s.startsWith('DELETE FROM app_sessions')){sessions.push(args[0]);return [{affectedRows:1}]}
  throw Error('Unsupported synthetic users query');
 }
 return {query,sessions};
}
module.exports={usersQuery};

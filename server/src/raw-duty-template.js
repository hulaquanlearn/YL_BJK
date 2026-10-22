const crypto=require('node:crypto');
const etag=t=>crypto.createHash('sha256').update(JSON.stringify([t.title,t.entries.map(e=>[e.id,e.category,e.title,e.frequency,e.evidence])])).digest('hex');
const publicTemplate=t=>({...t,etag:etag(t)});
module.exports={etag,publicTemplate};

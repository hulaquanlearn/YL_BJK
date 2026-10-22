// Run on the owner's local computer. Transfer only this sanitized snapshot to a
// private server directory when needed; never transfer Codex auth files.
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{const output=path.resolve(process.argv[2]||'.local/codex-usage.json');const data={checkedAt:new Date().toISOString(),...await require('../server/src/codex-usage').readLocal()};await fs.mkdir(path.dirname(output),{recursive:true});const tmp=output+'.tmp';await fs.writeFile(tmp,JSON.stringify(data),{mode:0o600});await fs.rename(tmp,output);console.log('Codex usage snapshot saved: '+output)})().catch(()=>{console.error('Codex usage unavailable; existing snapshot was preserved');process.exitCode=1});

const test=require('node:test'),assert=require('node:assert/strict');
const {ensureUsernameCase}=require('../src/username-schema');
test('case-sensitive username migration preserves the unique index and runs only when needed',async()=>{
 let collation='utf8mb4_0900_ai_ci';const changes=[];
 const db={query:async(sql)=>{if(sql.startsWith('SELECT COLLATION_NAME'))return [[{collation}]];changes.push(sql);collation='utf8mb4_0900_as_cs';return [{}]}};
 await ensureUsernameCase(db);await ensureUsernameCase(db);
 assert.deepEqual(changes,['ALTER TABLE app_users MODIFY username VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL']);
 assert.doesNotMatch(changes[0],/DROP|DELETE|UPDATE|RENAME/);
});

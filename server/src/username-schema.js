async function ensureUsernameCase(db){
 const [rows]=await db.query("SELECT COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_users' AND COLUMN_NAME='username'");
 if(rows.length&&rows[0].collation!=='utf8mb4_0900_as_cs'){
  // Change only the login identifier; the existing unique index is retained.
  await db.query('ALTER TABLE app_users MODIFY username VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL');
 }
}
module.exports={ensureUsernameCase};

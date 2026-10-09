const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process')

const modules=[
  require.resolve('brace-expansion'),
  require.resolve('brace-expansion',{paths:[path.dirname(require.resolve('readdir-glob'))]})
]
for(const modulePath of [...new Set(modules)]){
  test(`brace expansion keeps normal patterns and bounds nested input (${path.relative(process.cwd(),modulePath)})`,()=>{
    // Keep hostile patterns inside a bounded child process rather than the API process.
    const child=spawnSync(process.execPath,['-e',`
      const expand=require(process.argv[1]);
      const ordinary=expand('file-{1..3}.txt');
      const nested=expand('{'.repeat(3200)+'a,b'+'}'.repeat(3200));
      const comma=expand('{a,'.repeat(4000)+'z'+'}'.repeat(4000));
      process.stdout.write(JSON.stringify({ordinary,nestedArray:Array.isArray(nested),commaArray:Array.isArray(comma)}));
    `,modulePath],{timeout:4000,maxBuffer:65536,encoding:'utf8',windowsHide:true})
    assert.equal(child.error,undefined)
    assert.equal(child.status,0,child.stderr)
    const result=JSON.parse(child.stdout)
    assert.deepEqual(result.ordinary,['file-1.txt','file-2.txt','file-3.txt'])
    assert.equal(result.nestedArray,true);assert.equal(result.commaArray,true)
  })
}

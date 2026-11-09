const test=require('node:test'),assert=require('node:assert/strict');
const {createDepositGrid,depositSegment,finalizeDepositGrid,depositCells,depositStats,potVolumeAtHeight}=require('../src/robot-deposit-grid');

function sumCells(grid){return Object.values(grid.cells).reduce((sum,cell)=>sum+cell.volume,0)}
function assertConserved(grid){assert.ok(Math.abs(sumCells(grid)-grid.depositedVolume)<1e-10,`cells ${sumCells(grid)} != deposited ${grid.depositedVolume}`);for(const cell of Object.values(grid.cells)){assert.ok(cell.height>=0&&cell.height<=grid.potHeight+1e-9,`cell height ${cell.height} exceeds pot`);assert.ok(cell.volume<=cell.capacity+1e-9);assert.ok(cell.area>0&&Number.isFinite(cell.volume));}}

test('grid starts empty, deposits only near the path, and conserves visible volume',()=>{
 const grid=createDepositGrid({targetHeight:800,gridSize:24});
 assert.equal(grid.completed,false);assert.equal(grid.depositedVolume,0);assert.equal(sumCells(grid),0);
 const result=depositSegment(grid,{fromU:-.04,fromV:.02,toU:.04,toV:.02,volume:.0006,widthM:.30});
 assert.ok(result.added>0);assert.ok(grid.depositedVolume>0);assert.ok(Object.values(grid.cells).filter(c=>c.volume>0).length<grid.insideCount,'must not prefill whole bottom');
 assertConserved(grid);
 const before=JSON.stringify(depositCells(grid));assert.equal(depositSegment(grid,{fromU:0,fromV:0,toU:0,toV:0,volume:0}).added,0);assert.equal(JSON.stringify(depositCells(grid)),before);
});

test('deposit follows trajectory coverage and uses the 0.30 m discharge width',()=>{
 const grid=createDepositGrid({targetHeight:800,gridSize:24});
 depositSegment(grid,{fromU:-.5,fromV:.05,toU:-.5,toV:.05,volume:.001,widthM:.30});
 const left=depositCells(grid).map(cell=>cell.key);
 depositSegment(grid,{fromU:.5,fromV:.05,toU:.5,toV:.05,volume:.001,widthM:.30});
 const all=depositCells(grid).map(cell=>cell.key);
 assert.ok(all.length>left.length,'separated trajectory point expands coverage');
 assertConserved(grid);
});

test('volume is not clipped: repeated deposits conserve exactly and never exceed target height',()=>{
 const grid=createDepositGrid({targetHeight:800,gridSize:24});const target=grid.targetVolume;
 for(let i=0;i<8;i++)depositSegment(grid,{fromU:(i%4-1.5)*.2,fromV:(Math.floor(i/4)-.5)*.2,toU:(i%4-1.5)*.2,toV:(Math.floor(i/4)-.5)*.2,volume:target/16,widthM:.30});
 assert.ok(grid.depositedVolume>0&&grid.depositedVolume<target);assertConserved(grid);
 const stat=depositStats(grid);assert.ok(stat.visibleVolume>0);assert.ok(stat.coveredCells<=stat.gridCells);
});

test('final target fills the whole pot footprint with exact volume=targetVolume',()=>{
 const grid=createDepositGrid({targetHeight:800,gridSize:24});const target=grid.targetVolume;
 depositSegment(grid,{fromU:-.8,fromV:0,toU:.8,toV:0,volume:target,widthM:.30});
 finalizeDepositGrid(grid);
 assert.equal(grid.completed,true);assert.ok(Math.abs(grid.depositedVolume-target)<1e-10);assertConserved(grid);
 const cells=depositCells(grid),stat=depositStats(grid);
 const centre=Object.values(grid.cells).find(c=>c.ix===12&&c.iy===12),edge=Object.values(grid.cells).find(c=>c.ix===23&&c.iy===12);assert.ok(edge.height>centre.height+.02,'finished profile must be edge-high and centre-low');
 assert.equal(stat.coveredCells,cells.length);assert.ok(stat.coveredCells>=grid.insideCount*.99,'completed pot should cover the usable footprint');
 for(const cell of cells)assert.ok(cell.baseHeight===0||Number.isFinite(cell.baseHeight));
 assert.ok(Math.abs(sumCells(grid)-potVolumeAtHeight(.8))<1e-8);
 assert.equal(depositSegment(grid,{fromU:0,fromV:0,toU:0,toV:0,volume:.1}).added,0,'completed grid ignores further material');
});

test('boundary/NaN inputs are clamped and do not create invalid cells',()=>{
 const grid=createDepositGrid({targetHeight:800,gridSize:16});depositSegment(grid,{fromU:-99,fromV:NaN,toU:99,toV:99,volume:.01,widthM:0});
 for(const cell of depositCells(grid)){assert.ok(cell.u>=-1&&cell.u<=1);assert.ok(cell.v>=-1&&cell.v<=1);assert.ok(Number.isFinite(cell.volume)&&Number.isFinite(cell.height));}
 assertConserved(grid);
});

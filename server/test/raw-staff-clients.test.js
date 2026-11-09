const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const auth=require('../../miniprogram/services/auth');

test('账号创建与编辑随车间切换岗位选项，原粮工段长提交 shift_leader',()=>{
  let page;
  const stub={requireWrite:()=>true,canEditAnyWorkshop:()=>true,userWorkshopCode:()=>'',staffPositionLabel:auth.staffPositionLabel};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/pages/users/users.js'),'utf8'),{require:n=>n.endsWith('auth.js')?stub:{},Page:p=>page=p});
  page.setData=values=>{for(const [key,value] of Object.entries(values)){const [a,b]=key.split('.');if(b)page.data[a][b]=value;else page.data[a]=value;}};
  page.openCreate();
  assert.equal(JSON.stringify(page.data.createPositionNames),JSON.stringify(['员工','线长 / 组长','班长 / 工段长','维修人员（车间）','维修人员（厂家）']));
  assert.equal(page.data.newUser.staffPosition,'employee');
  page.onNewPosition({detail:{value:2}});assert.equal(page.data.newUser.staffPosition,'shift_leader');
  page.onNewWorkshop({detail:{value:2}});
  assert.equal(JSON.stringify(page.data.createPositionNames),JSON.stringify(['员工','线长 / 组长','班长 / 工段长','维修人员（车间）','维修人员（厂家）']));
  assert.equal(page.data.newUser.staffPosition,'employee');
  page.data.users=[{id:'7',role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'group_leader'}];
  page.openIdentity({currentTarget:{dataset:{id:'7'}}});
  assert.equal(page.data.positionNames[page.data.editPositionIndex],'线长 / 组长');
  page.onEditWorkshop({detail:{value:3}});
  assert.equal(JSON.stringify(page.data.positionNames),JSON.stringify(['待分配','员工','线长 / 组长','班长 / 工段长','维修人员（车间）','维修人员（厂家）']));
});

test('小程序员工不能提交盘点且门户仅保留备件',()=>{
  const work=require('../../miniprogram/services/work-features');
  for(const staffPosition of ['employee','group_leader']) {
    const user={role:'viewer',staffWorkshopCode:'raw_grain',workshopCode:'raw_grain',staffPosition};
    const previous=global.wx;global.wx={getStorageSync:()=>user};
    try {assert.equal(auth.canSubmitInventory(),false);} finally {global.wx=previous;}
    assert.deepEqual(work.features(user).map(f=>f.id),['spare']);
  }
});

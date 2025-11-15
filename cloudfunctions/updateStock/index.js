// cloudfunctions/updateStock/index.js
const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();

exports.main = async (event, context) => {
  const { id, type, num, lastUpdate } = event;

  try {
    // 1. 查询当前配件（必须用云数据库的`_id`查询）
    const part = await db.collection('parts').doc(id).get();
    if (!part.data) {
      return { success: false, errMsg: '配件不存在' };
    }

    // 2. 计算新库存
    let newStock;
    if (type === 'in') {
      newStock = (part.data.stock || 0) + num; // 库存字段为`stock`，若实际字段名不同需替换
    } 
    if (type === 'out') {
      if (num > (part.data.stock || 0) || (part.data.stock || 0) <= (part.data.minStock || 0)) {
        return { success: false, errMsg: '库存不足或已达最低库存' };
      }
      newStock = (part.data.stock || 0) - num;
    }

    // 3. 更新数据库
    await db.collection('parts').doc(id).update({
      data: {
        stock: newStock,
        lastUpdate: lastUpdate
      }
    });

    return { success: true };
  } catch (err) {
    console.error('库存更新失败：', err);
    return { success: false, errMsg: err.message };
  }
};
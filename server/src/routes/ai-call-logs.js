const express=require('express');
const {ApiError,asyncHandler}=require('../utils');
function createRouter(store=require('../ai-call-audit').defaultStore){
 const router=express.Router();router.get('/ai-call-logs',asyncHandler(async(req,res)=>{if(!req.user)throw new ApiError(401,'请先登录');if(req.user.role!=='admin')throw new ApiError(403,'仅系统管理员可以查看 AI 调用记录');res.json({success:true,data:await store.list(req.query)})}));return router;
}
module.exports={createRouter};

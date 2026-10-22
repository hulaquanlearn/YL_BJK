const express=require('express');
const {ApiError,asyncHandler}=require('../utils');
function createRouter(service=require('../personal-usage').createUsageService(),store=require('../ai-call-audit').defaultStore){
 const router=express.Router();
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');if(!req.user)return next(new ApiError(401,'请先登录'));if(req.user.role!=='admin')return next(new ApiError(403,'仅系统管理员可以查看使用量'));next()});
 router.get('/providers',asyncHandler(async(_req,res)=>res.json({success:true,data:await service.read()})));
 router.get('/records-summary',asyncHandler(async(req,res)=>{const result=await store.list({...req.query,page:1,pageSize:1});res.json({success:true,data:{from:result.from,to:result.to,summary:result.summary,providers:result.providers}})}));
 return router;
}
module.exports={createRouter};

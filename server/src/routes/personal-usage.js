const express=require('express');
const {ApiError,asyncHandler}=require('../utils');
function createRouter(service=require('../personal-usage').createUsageService(),platform=require('../openai-platform-usage').createPlatformUsageService()){
 const router=express.Router();
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');if(!req.user)return next(new ApiError(401,'请先登录'));if(req.user.role!=='admin')return next(new ApiError(403,'仅系统管理员可以查看使用量'));next()});
 router.get('/providers',asyncHandler(async(_req,res)=>res.json({success:true,data:await service.read()})));
 router.get('/openai-platform',asyncHandler(async(req,res)=>res.json({success:true,data:await platform.read(req.query)})));
 return router;
}
module.exports={createRouter};

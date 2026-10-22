const express=require('express'),{asyncHandler}=require('../utils'),{requireStorageAdmin}=require('../work-storage');
function createRouter({pool=require('../db').pool,library=require('../robot-library').defaultLibrary,config=require('../config'),manager=require('../data-management').createManager({pool,library,config})}={}){
 const router=express.Router();router.use(requireStorageAdmin);router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next()});const ok=(res,data)=>res.json({success:true,data});
 router.get('/',asyncHandler(async(_req,res)=>ok(res,await manager.catalog())));
 router.get('/audit',asyncHandler(async(_req,res)=>ok(res,await manager.audit())));
 router.post('/cleanup-preview',asyncHandler(async(req,res)=>ok(res,await manager.preview(req.body.kind,req.user.id))));
 router.post('/cleanup',asyncHandler(async(req,res)=>ok(res,await manager.cleanup(req.body.previewId,req.user.id))));
 router.delete('/robot/:id/analysis',asyncHandler(async(req,res)=>ok(res,await library.clearAnalysis(req.params.id,req.body.revision))));
 return router;
}
module.exports={createRouter};

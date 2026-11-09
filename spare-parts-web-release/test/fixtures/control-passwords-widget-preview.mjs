import {mountControlPasswords as mount} from '/src/control-passwords/widget.js'
const service={list:async()=>({data:{revision:'preview',canManage:true,rows:Array.from({length:9},(_,index)=>({id:index+1,name:`${index+1}号电脑`,username:'',configured:false,note:'',updatedAt:null,updatedBy:''}))}}),reveal:async()=>{throw Error('No credentials in model preview')}}
export const mountControlPasswords=element=>mount(element,{service})

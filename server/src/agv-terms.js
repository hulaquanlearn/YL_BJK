'use strict';
function normalizeAgvTerms(value){return typeof value==='string'?value.replace(/(?:背负式|潜伏式)\s*AGV/gi,'潜伏式AGV'):value;}
module.exports={normalizeAgvTerms};

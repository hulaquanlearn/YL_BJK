import test from 'node:test'
import assert from 'node:assert/strict'
import {isPageAssetError} from '../src/utils/page-load-error.mjs'
test('expired page assets have a recoverable refresh prompt without treating permissions as version errors',()=>{
 for(const message of ['Failed to fetch dynamically imported module: /assets/old.js','Importing a module script failed.','error loading dynamically imported module','Loading chunk 5 failed.'])assert.equal(isPageAssetError(new Error(message)),true)
 for(const message of ['权限不足','Request failed with status code 403','Failed to fetch',''])assert.equal(isPageAssetError(new Error(message)),false)
})

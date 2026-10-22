import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {clientPlatform} from '../src/utils/client-platform.mjs'

test('browser, Android shell and embedded mini-program requests have separate client markers',()=>{
 assert.equal(clientPlatform('Mozilla/5.0 Windows Chrome/130',false),'web')
 assert.equal(clientPlatform('Mozilla/5.0 Android Chrome/130 Mobile',false),'web')
 assert.equal(clientPlatform('Mozilla/5.0 Android; wv DigitalWorkbenchAndroid/1.0',false),'android')
 assert.equal(clientPlatform('Mozilla/5.0 Android; wv DigitalWorkbenchAndroid/1.9.10-android.4',false),'android')
 assert.equal(clientPlatform('Mozilla/5.0 MicroMessenger miniProgram',false),'miniprogram')
 assert.equal(clientPlatform('Mozilla/5.0 MicroMessenger',true),'miniprogram')
 for(const file of ['index.js','raw-duties.js'])assert.match(fs.readFileSync(new URL('../src/api/'+file,import.meta.url),'utf8'),/'X-Client-Platform':clientPlatform\(\)/)
 assert.match(fs.readFileSync(new URL('../../android-app/app/src/main/java/cn/digitalworkbench/mobile/MainActivity.java',import.meta.url),'utf8'),/setUserAgentString\(settings.getUserAgentString\(\) \+ " DigitalWorkbenchAndroid\/" \+ AppUpdater.version\(this\)\)/)
})

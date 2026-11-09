import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.argv[2]
if(!outDir)throw Error('Specify an isolated output directory')
await build({configFile:false,root,base:'/control-passwords-module/',publicDir:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},plugins:[vue()],build:{outDir:path.resolve(outDir),emptyOutDir:false,minify:'esbuild',target:'chrome80',cssCodeSplit:false,sourcemap:false,lib:{entry:path.join(root,'src/control-passwords/widget.js'),formats:['es'],fileName:()=> 'widget.js'},rollupOptions:{output:{assetFileNames:'[name]-[hash][extname]'}}}})

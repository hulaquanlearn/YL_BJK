import manifest from './reviewed-model-variants.json' with {type:'json'}
import {modelReview} from './model-observation.mjs'

export function partModelVariants(part,variants=manifest.variants){
 const url=String(part?.categoryModelUrl || '').split(/[?#]/)[0]
 if(!url)return []
 const bound=modelReview(url)
 if(!bound || part.categoryModelId!=null && String(part.categoryModelId)!==String(bound.id))return []
 return variants.filter(item=>String(item.catalogId)===String(bound.id)
  && /^[A-Za-z0-9_-]{1,100}$/.test(item.id || '')
  && /^\/models\/variants-\d{8}\/[A-Za-z0-9_-]+\.glb$/.test(item.url || '')
  && /^[a-f0-9]{64}$/.test(item.sha256 || '') && typeof item.model==='string'
  && typeof item.previewOnly==='boolean')
}

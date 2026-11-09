import {buildAgvModel} from './agv-model.mjs'
import {buildForkliftAgvModel} from './agv-forklift-model.mjs'
export const familyNames={latent:'潜伏式AGV',counterweight:'平衡重AGV',flipping:'翻曲AGV'}
export const modelTitle=(family='latent',variant='old')=>family==='latent'?`潜伏式AGV（${variant==='new'?'新':'老'}）`:familyNames[family]
export function buildVehicleModel({family='latent',variant='old'}={}){return family==='latent'?buildAgvModel({variant}):buildForkliftAgvModel(family)}

import { modelDisplayStatus } from './model-display-status.mjs'
import { modelReviewConfirmed } from './model-review.mjs'

export const partModelReviewed = part => modelReviewConfirmed({ reviewDecision: part?.categoryModelReviewDecision })
export const partModelStatus = part => modelDisplayStatus({ modelUrl: part?.categoryModelUrl, reviewDecision: part?.categoryModelReviewDecision })
export const partModelNeedsReview = part => partModelStatus(part).key === 'pending'

// A pending or unbound part must not borrow an unrelated model or placeholder.
export function displayedPartModel(part) {
  return typeof part?.categoryModelUrl === 'string' ? part.categoryModelUrl : ''
}

// The API's imageUrl may fall back to the model reference image.
export function partPhotoUrl(part) {
  if (!part) return ''
  if (Object.prototype.hasOwnProperty.call(part, 'partImageUrl')) return part.partImageUrl || ''
  return part.imageSource === 'part' ? part.imageUrl || '' : ''
}

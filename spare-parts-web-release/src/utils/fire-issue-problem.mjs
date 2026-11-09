export function fireIssueProblem(remark) {
 const text = remark?.trim()
 if (!text) return '情况未填写'
 const generated = text.match(/^(?:拍照点检|AI识别)\s*\d{4}-\d{2}\s*检查卡异常[：:]\s*(.+?)(?:[；;]\s*人工确认[：:].*)?$/s)
 return generated ? generated[1].replace(/×(?=、|$)/g, '').trim() : text
}

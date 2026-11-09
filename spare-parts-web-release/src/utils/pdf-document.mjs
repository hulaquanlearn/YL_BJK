// Pass authenticated file bytes to PDF.js. Fetching a blob: URL would be blocked
// by the site's connect-src 'self' policy, even after the API download succeeds.
export async function readPdfData(file) {
  if (!file) throw new TypeError('PDF file is required')
  const buffer=typeof file.arrayBuffer==='function'?await file.arrayBuffer():await new Promise((resolve,reject)=>{if(typeof FileReader==='undefined'){reject(new TypeError('PDF file reader is unavailable'));return}const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error('PDF file read failed'));reader.readAsArrayBuffer(file)})
  const data = new Uint8Array(buffer)
  if (!data.length) throw new Error('PDF file is empty')
  return data
}

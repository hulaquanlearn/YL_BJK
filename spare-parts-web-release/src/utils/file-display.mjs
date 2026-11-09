export function fileSize(value){const n=Number(value)||0;return n<1024?`${n} B`:n<1024**2?`${(n/1024).toFixed(1)} KB`:`${(n/1024**2).toFixed(2)} MB`}

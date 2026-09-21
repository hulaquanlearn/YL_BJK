require('dotenv').config();
const { getDocumentCapabilities, cleanDocumentCache } = require('../src/document-service');
(async () => {
  const capabilities = await getDocumentCapabilities();
  console.log(JSON.stringify(capabilities, null, 2));
  if (process.argv.includes('--clean-cache')) await cleanDocumentCache();
  if (process.argv.includes('--require-full') && (!capabilities.office || !capabilities.pdfText || !capabilities.imageOcr || !capabilities.pdfRaster || !capabilities.sandbox)) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });

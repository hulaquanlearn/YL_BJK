// Bundle as a classic worker so Android WebViews do not parse the untranspiled
// vendor module asset. Its realm needs its own platform polyfills.
import 'core-js/actual/promise/with-resolvers.js'
import 'core-js/actual/structured-clone.js'
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs'
globalThis.pdfjsWorker={WorkerMessageHandler}

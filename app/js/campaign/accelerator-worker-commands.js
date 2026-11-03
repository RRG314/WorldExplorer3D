import { calculateAcceleratorExperiment } from './accelerator-experiments.js';
import {
  ACCELERATOR_PROTOCOL,
  ACCELERATOR_SOURCE,
  acceleratorStudy,
} from './accelerator-studies.js';
import { CMS_STUDY_REFERENCE } from './cms-study-reference.js';
import {
  validateBundle,
  prepareSummary,
  select,
  decode,
  invariantMass,
} from '../../vendor/collision-lab/science.mjs';
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
export function createAcceleratorWorkerProcessor({ fetchImpl = fetch, cryptoImpl = crypto } = {}) {
  let data = null;
  async function load() {
    if (!data)
      data = (async () => {
        const response = await fetchImpl(ACCELERATOR_SOURCE.dataUrl, {
          credentials: 'same-origin',
          redirect: 'error',
        });
        if (!response.ok)
          throw Error('The recorded CMS source is unavailable. Retry the data load.');
        if (Number(response.headers.get('content-length')) > ACCELERATOR_SOURCE.dataBytes)
          throw Error('The recorded source exceeds its byte budget.');
        const reader = response.body.getReader(),
          chunks = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > ACCELERATOR_SOURCE.dataBytes)
              throw Error('The recorded source exceeds its byte budget.');
            chunks.push(value);
          }
        } catch (error) {
          await reader.cancel().catch(() => {});
          throw error;
        } finally {
          reader.releaseLock();
        }
        if (size !== ACCELERATOR_SOURCE.dataBytes)
          throw Error('The recorded CMS source is incomplete.');
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        if (hex(await cryptoImpl.subtle.digest('SHA-256', bytes)) !== ACCELERATOR_SOURCE.dataSha256)
          throw Error('The recorded CMS source digest changed.');
        const bundle = validateBundle(JSON.parse(new TextDecoder().decode(bytes))),
          summary = prepareSummary(bundle);
        return { bundle, summary };
      })().catch((error) => {
        data = null;
        throw error;
      });
    return data;
  }
  return {
    async run(request) {
      if (
        request?.protocol !== ACCELERATOR_PROTOCOL ||
        !Number.isSafeInteger(request.requestId) ||
        request.requestId < 1 ||
        !Number.isSafeInteger(request.generation) ||
        request.generation < 0 ||
        !Number.isSafeInteger(request.revision) ||
        request.revision < 0 ||
        JSON.stringify(request).length > 8192
      )
        throw Error('This experiment request is invalid or too large.');
      const result = calculateAcceleratorExperiment(
        request.studyId,
        request.method,
        request.inputs
      );
      if (['mass', 'population'].includes(request.method)) {
        const { bundle, summary } = await load(),
          study = acceleratorStudy(request.studyId);
        if (request.method === 'mass') {
          const witness = CMS_STUDY_REFERENCE.witnesses[request.studyId],
            event = decode(bundle.events[witness.row - 1], witness.row - 1);
          if (
            JSON.stringify(event.muons) !== JSON.stringify(witness.muons) ||
            Math.abs(invariantMass(...event.muons) - result.readings.invariantMassGeV) > 1e-8
          )
            throw Error('The recorded event witness changed.');
        } else {
          const selection = select(summary, study.cutGeV, request.inputs.charge),
            digest = hex(
              await cryptoImpl.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(JSON.stringify(selection.indices))
              )
            );
          if (
            selection.indices.length !== result.readings.count ||
            JSON.stringify(selection.bins) !== JSON.stringify(result.readings.bins) ||
            selection.outside !== result.readings.outsideHistogram ||
            digest !== result.readings.selectedRowsSha256
          )
            throw Error('The recorded population no longer reproduces its study reference.');
        }
        result.dataVerification = {
          bundleSha256: ACCELERATOR_SOURCE.dataSha256,
          sourceSha256: bundle.sourceSha256,
          rows: bundle.count,
          category: bundle.category,
        };
      }
      return result;
    },
    snapshot: () => ({ recordedDataRequested: !!data }),
  };
}

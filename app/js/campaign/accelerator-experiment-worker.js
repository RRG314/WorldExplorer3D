import { createAcceleratorWorkerProcessor } from './accelerator-worker-commands.js';
const processor = createAcceleratorWorkerProcessor();
self.onmessage = async ({ data }) => {
  const identity = {
    protocol: data?.protocol,
    requestId: data?.requestId,
    generation: data?.generation,
    revision: data?.revision,
  };
  try {
    const result = await processor.run(data);
    self.postMessage({ ...identity, ok: true, result });
  } catch (error) {
    self.postMessage({
      ...identity,
      ok: false,
      error: String(error.message || error).slice(0, 300),
    });
  }
};

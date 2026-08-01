import type {
  InboundSamplerMessage,
  OutboundSamplerMessage
} from "../models/sampler-message.model";
import { createSamplerHandler } from "./sampler-handler";

// The project's lib config doesn't include `webworker`, so `self` types as
// `Window` here. This file only ever runs inside a dedicated worker (loaded
// via Vite's `?worker` import), where `self` is the worker global scope.
interface DedicatedWorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<InboundSamplerMessage>) => void) | null;
}
const workerScope = self as unknown as DedicatedWorkerScope;

/**
 * Post an outbound message from this worker, transferring the given
 * buffers rather than copying them - the handler's flush arrays are dead
 * after posting.
 * @param message Message to send to the main thread.
 * @param transfer Buffers to transfer ownership of.
 */
function post(
  message: OutboundSamplerMessage,
  transfer: Transferable[] = []
): void {
  workerScope.postMessage(message, transfer);
}

const handler = createSamplerHandler(post);

workerScope.onmessage = event => {
  void handler.handleMessage(event.data);
};

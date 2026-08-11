import type {
  InboundInverseKinematicsMessage,
  OutboundInverseKinematicsMessage
} from "../model/inverse-kinematics-message.model";
import { handleInverseKinematicsMessage } from "./inverse-kinematics-handler";

// The project's lib config doesn't include `webworker`, so `self` types as
// `Window` here. This file only ever runs inside a dedicated worker (loaded
// via Vite's `?worker` import), where `self` is the worker global scope.
interface DedicatedWorkerScope {
  postMessage(message: OutboundInverseKinematicsMessage): void;
  onmessage:
    | ((event: MessageEvent<InboundInverseKinematicsMessage>) => void)
    | null;
}
const workerScope = self as unknown as DedicatedWorkerScope;

workerScope.onmessage = event => {
  try {
    workerScope.postMessage(handleInverseKinematicsMessage(event.data));
  } catch {
    workerScope.postMessage({
      type: "failedInverseKinematics",
      requestId: event.data.requestId
    });
  }
};

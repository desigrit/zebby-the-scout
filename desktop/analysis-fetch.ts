import { Agent, Dispatcher1Wrapper } from "undici";

// Node's default header timeout is shorter than High thinking's eight-minute
// deadline. The caller's AbortSignal still controls cancellation and duration.
const analysisAgent = new Dispatcher1Wrapper(new Agent({ headersTimeout: 540000, bodyTimeout: 540000, connectTimeout: 10000 }));
export const analysisFetch: typeof fetch = (input, init) => {
  const options = { ...init, dispatcher: analysisAgent };
  // The adapter supports Node's bundled dispatcher protocol as well as newer
  // runtimes, while retaining the host's fetch implementation and test boundary.
  return fetch(input, options);
};

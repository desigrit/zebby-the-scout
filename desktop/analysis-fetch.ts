import { Agent, fetch as nodeFetch, type RequestInfo, type RequestInit } from "undici";

// Node's default header timeout is shorter than High thinking's eight-minute
// deadline. The caller's AbortSignal still controls cancellation and duration.
const analysisAgent = new Agent({ headersTimeout: 540000, bodyTimeout: 540000, connectTimeout: 10000 });
export const analysisFetch: typeof fetch = (input, init) => {
  const options = { ...init, dispatcher: analysisAgent };
  // Use the matching fetch implementation. Node's bundled dispatcher protocol
  // can differ from the installed Undici version.
  return nodeFetch(input as RequestInfo, options as RequestInit) as unknown as Promise<Response>;
};

declare module "@11ty/eleventy-fetch" {
  interface EleventyFetchOptions {
    duration?: string;
    type?: "json" | "text" | "buffer" | "response";
    fetchOptions?: RequestInit;
    verbose?: boolean;
    dryRun?: boolean;
    failOnError?: boolean;
    removeUrlScheme?: boolean;
  }

  function EleventyFetch(
    url: string,
    options?: EleventyFetchOptions
  ): Promise<unknown>;

  export default EleventyFetch;
}
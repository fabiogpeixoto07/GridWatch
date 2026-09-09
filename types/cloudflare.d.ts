declare type Fetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

// The runtime supplies the complete Cloudflare D1 API. Keeping this minimal
// declaration local makes the browser/IIS build typecheck without requiring a
// deployment-only workers-types package.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare type D1Database = any;

declare module "cloudflare:workers" {
  export const env: { DB?: D1Database };
}

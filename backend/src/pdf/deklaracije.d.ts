// Wrangler "Data" rule (wrangler.toml [[rules]]) bundla .ttf kao ArrayBuffer.
declare module '*.ttf' {
  const data: ArrayBuffer;
  export default data;
}

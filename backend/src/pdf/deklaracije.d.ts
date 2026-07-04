// Wrangler "Data" rule (wrangler.toml [[rules]]) bundla .ttf kao ArrayBuffer.
declare module '*.ttf' {
  const data: ArrayBuffer;
  export default data;
}

// Wrangler "Text" rule bundla .pem (Fina CA certifikati za CIS TLS) kao string.
declare module '*.pem' {
  const tekst: string;
  export default tekst;
}

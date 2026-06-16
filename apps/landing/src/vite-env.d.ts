/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string;
  readonly VITE_DOCS_URL?: string;
  readonly VITE_GITHUB_URL?: string;
  readonly VITE_DISCORD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// vite-imagetools `?…&as=picture` imports — keys in `sources` are format names
// (e.g. "avif", "webp"), so render them as `type={`image/${format}`}`.
declare module "*as=picture" {
  const picture: {
    sources: Record<string, string>;
    img: { src: string; w: number; h: number };
  };
  export default picture;
}

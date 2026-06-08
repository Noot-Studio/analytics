import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";

import { docsRoute } from "./shared";

export const source = loader({
  baseUrl: docsRoute,
  plugins: [lucideIconsPlugin()],
  source: docs.toFumadocsSource(),
});

export const markdownPathToSlugs = (segs: string[]) => {
  if (segs.length === 0) {
    return [];
  }

  const out = [...segs];
  out[out.length - 1] = out.at(-1).replace(/\.md$/u, "");
  if (out.length === 1 && out[0] === "index") {
    out.pop();
  }
  return out;
};

export const slugsToMarkdownPath = (slugs: string[]) => {
  const segments = [...slugs];
  if (segments.length === 0) {
    segments.push("index.md");
  } else {
    segments[segments.length - 1] += ".md";
  }

  return {
    segments,
    url: `${docsRoute}/${segments.join("/")}`,
  };
};

export const getPageMarkdownUrl = (slugs: string[]) => {
  const segments = [...slugs];
  if (segments.length === 0) {
    segments.push("index.md");
  } else {
    segments[segments.length - 1] += ".md";
  }

  return {
    segments,
    url: `${docsRoute}/${segments.join("/")}`,
  };
};

export const getLLMText = async (page: (typeof source)["$inferPage"]) => {
  const processed = await page.data.getText("processed");

  return `# ${page.data.title} (${page.url})

${processed}`;
};

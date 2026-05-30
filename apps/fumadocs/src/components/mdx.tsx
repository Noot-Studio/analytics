import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import { Hoppscotch } from "./hoppscotch";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Hoppscotch,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}

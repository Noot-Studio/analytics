import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import { Hoppscotch } from "./hoppscotch";

export const getMDXComponents = (components?: MDXComponents) => ({
  ...defaultMdxComponents,
  Hoppscotch,
  ...components,
});

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}

/// <reference types="vite/client" />

declare module "*.mdx" {
  import type { ComponentType } from "react";
  const component: ComponentType<{ components?: Record<string, ComponentType> }>;
  export const frontmatter: unknown;
  export default component;
}

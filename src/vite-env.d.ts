/// <reference types="vite/client" />

declare module "*.mdx" {
  import type { ComponentType } from "react";
  const component: ComponentType<{ components?: Record<string, ComponentType> }>;
  export const frontmatter: unknown;
  export default component;
}

declare module "virtual:blog-registry" {
  export const blogEntries: Array<{
    title: string;
    description: string;
    date: string;
    author: string;
    slug: string;
    category: string;
    draft: boolean;
    image?: string;
    format: "markdown" | "mdx";
    path: string;
  }>;
  export const postLoaders: Record<string, () => Promise<{ default: import("react").ComponentType }>>;
}

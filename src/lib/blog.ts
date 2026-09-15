import type { ComponentType } from "react";

export interface BlogFrontmatter {
  title: string;
  description: string;
  date: string;
  author: string;
  slug: string;
  category: string;
  draft: boolean;
  image?: string;
}

export interface BlogPost extends BlogFrontmatter {
  format: "markdown" | "mdx";
  path: string;
  body?: ComponentType;
}

import { blogEntries, postLoaders } from "virtual:blog-registry";

export const blogPosts: BlogPost[] = blogEntries
  .filter((post) => !post.draft)
  .sort((a, b) => b.date.localeCompare(a.date));

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

export async function loadBlogPost(post: BlogPost): Promise<BlogPost> {
  const module = await postLoaders[post.path]?.();
  return module ? { ...post, body: module.default } : post;
}

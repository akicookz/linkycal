import type { ComponentType } from "react";
import { z } from "zod";
import { parse as parseYaml } from "yaml";

const markdownPosts = import.meta.glob("../content/blog/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const mdxPosts = import.meta.glob("../content/blog/*.mdx", {
  eager: true,
}) as Record<string, { default: ComponentType<{ components?: Record<string, ComponentType> }>; frontmatter?: unknown }>;

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

const frontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate, "must be a real calendar date"),
  author: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.string().min(1),
  draft: z.boolean().default(false),
  image: z.string().optional(),
});

export type BlogFrontmatter = z.infer<typeof frontmatterSchema>;

export interface BlogPost extends BlogFrontmatter {
  format: "markdown" | "mdx";
  source?: string;
  body?: ComponentType<{ components?: Record<string, ComponentType> }>;
}

function parseMarkdownFrontmatter(source: string): { data: unknown; body: string } {
  if (!source.startsWith("---")) return { data: {}, body: source };
  const closing = source.indexOf("\n---", 3);
  if (closing < 0) return { data: {}, body: source };
  return { data: parseYaml(source.slice(4, closing)), body: source.slice(closing + 4).replace(/^\n/, "") };
}

function readMarkdownPost(path: string, source: string): BlogPost | null {
  const parsed = parseMarkdownFrontmatter(source);
  const result = frontmatterSchema.safeParse(parsed.data);
  if (!result.success) throw new Error(`Invalid blog frontmatter in ${path}: ${result.error.message}`);
  return { ...result.data, format: "markdown", source: parsed.body };
}

function readMdxPost(path: string, module: (typeof mdxPosts)[string]): BlogPost | null {
  const result = frontmatterSchema.safeParse(module.frontmatter);
  if (!result.success) throw new Error(`Invalid blog frontmatter in ${path}: ${result.error.message}`);
  return { ...result.data, format: "mdx", body: module.default };
}

const parsedPosts = [
  ...Object.entries(markdownPosts).map(([path, source]) => readMarkdownPost(path, source)),
  ...Object.entries(mdxPosts).map(([path, module]) => readMdxPost(path, module)),
].filter((post): post is BlogPost => post !== null && !post.draft);

const duplicateSlugs = parsedPosts.filter(
  (post, index) => parsedPosts.findIndex((candidate) => candidate.slug === post.slug) !== index,
);
if (duplicateSlugs.length > 0) {
  throw new Error(`Duplicate blog slug(s): ${duplicateSlugs.map((post) => post.slug).join(", ")}`);
}

export const blogPosts = parsedPosts.sort((a, b) => b.date.localeCompare(a.date));

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

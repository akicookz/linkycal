import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

function blogRegistryPlugin() {
  const virtualId = "virtual:blog-registry";
  const resolvedId = `\0${virtualId}`;
  const frontmatterSchema = z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
    }, "must be a real calendar date"),
    author: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    category: z.string().min(1),
    draft: z.boolean().default(false),
    image: z.string().optional(),
  });

  return {
    name: "blog-registry",
    resolveId(id: string) {
      return id === virtualId ? resolvedId : undefined;
    },
    load(id: string) {
      if (id !== resolvedId) return undefined;
      const contentDirectory = path.resolve(__dirname, "src/content/blog");
      const entries = readdirSync(contentDirectory)
        .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
        .map((file) => {
          const source = readFileSync(path.join(contentDirectory, file), "utf8");
          const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
          if (!match) throw new Error(`Missing blog frontmatter in src/content/blog/${file}`);
          const parsed = frontmatterSchema.safeParse(parseYaml(match[1]));
          if (!parsed.success) throw new Error(`Invalid blog frontmatter in src/content/blog/${file}: ${parsed.error.message}`);
          return { ...parsed.data, format: file.endsWith(".mdx") ? "mdx" : "markdown", path: `../content/blog/${file}` };
        });
      const slugs = new Set<string>();
      for (const entry of entries) {
        if (slugs.has(entry.slug)) throw new Error(`Duplicate blog slug: ${entry.slug}`);
        slugs.add(entry.slug);
      }
      const publishedEntries = entries.filter((entry) => !entry.draft);
      const loaders = publishedEntries.map((entry) =>
        `  ${JSON.stringify(entry.path)}: () => import(${JSON.stringify(`/src/content/blog/${path.basename(entry.path)}`)}),`,
      );
      return `export const blogEntries = ${JSON.stringify(publishedEntries)};\nexport const postLoaders = {\n${loaders.join("\n")}\n};`;
    },
    handleHotUpdate({ file, server }: { file: string; server: { restart: () => Promise<void> } }) {
      const contentDirectory = path.resolve(__dirname, "src/content/blog");
      if (file.startsWith(`${contentDirectory}${path.sep}`)) {
        void server.restart();
      }
    },
  };
}

function manualChunks(id: string): string | undefined {
  if (id.includes("/node_modules/chrono-node/")) return "chrono";
  if (
    id.includes("/node_modules/react/") ||
    id.includes("/node_modules/react-dom/") ||
    id.includes("/node_modules/react-router/") ||
    id.includes("/node_modules/react-router-dom/") ||
    id.includes("/node_modules/scheduler/") ||
    id.includes("/node_modules/cookie/") ||
    id.includes("/node_modules/set-cookie-parser/")
  ) {
    return "react-vendor";
  }
  if (
    id.includes("/node_modules/@tanstack/react-query/") ||
    id.includes("/node_modules/@tanstack/query-core/")
  ) {
    return "query-vendor";
  }
}

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [
    blogRegistryPlugin(),
    Object.assign(mdx({
        include: /src[\\/]content[\\/]blog[\\/].*\.mdx?$/,
        remarkPlugins: [remarkFrontmatter, remarkGfm],
      }), { enforce: "pre" as const }),
    react(),
    cloudflare(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "chrono-node/en": path.resolve(
        __dirname,
        "./node_modules/chrono-node/dist/esm/locales/en/index.js",
      ),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});

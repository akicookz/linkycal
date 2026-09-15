import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { SEOHead } from "@/components/SEOHead";
import { Logo } from "@/components/Logo";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getBlogPost, blogPosts, loadBlogPost, type BlogPost } from "@/lib/blog";

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(`${date}T00:00:00`));
}

function BlogCard({ post }: { post: (typeof blogPosts)[number] }) {
  return (
    <Card className="group overflow-hidden border-0 bg-muted/45 p-0 shadow-none transition-colors hover:bg-brand/5 md:py-0">
      <Link to={`/blog/${post.slug}`} className="block">
        <ArticleCover post={post} compact />
        <div className="p-6">
          <div className="flex items-center gap-2 text-xs font-medium text-brand">
            <span>{post.category}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="text-muted-foreground">{formatDate(post.date)}</span>
          </div>
          <h2 className="mt-4 font-heading text-2xl font-semibold tracking-[-0.02em] text-foreground group-hover:text-brand">
            {post.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{post.description}</p>
          <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand">
            Read article <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </Link>
    </Card>
  );
}

function BlogLayout({ children, onGetStarted }: { children: ReactNode; onGetStarted: () => void }) {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <MarketingNav onGetStarted={onGetStarted} />
      {children}
      <MarketingFooter />
    </div>
  );
}

interface ArticleHeading {
  id: string;
  label: string;
  level: 2 | 3;
}

function createHeadingId(label: string, usedIds: Set<string>): string {
  const base = label.toLowerCase().trim().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "") || "section";
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) id = `${base}-${suffix++}`;
  usedIds.add(id);
  return id;
}

function createHeadingLinkIcon(): SVGSVGElement {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  icon.classList.add("h-4", "w-4");
  for (const pathData of [
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-width", "2");
    icon.appendChild(path);
  }
  return icon;
}

function ensureHeadingLink(heading: HTMLHeadingElement, label: string, id: string): void {
  let link = heading.querySelector<HTMLAnchorElement>(":scope > a[data-heading-link]");
  if (!link) {
    link = document.createElement("a");
    link.dataset.headingLink = "true";
    link.className = "mr-2 inline-flex h-6 w-6 shrink-0 align-middle !text-muted-foreground/55 transition-colors hover:!text-brand focus-visible:!text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30";
    link.appendChild(createHeadingLinkIcon());
    heading.prepend(link);
  }
  link.href = `#${id}`;
  link.setAttribute("aria-label", `Link to section: ${label}`);
}

function ArticleBody({ PostBody, onHeadings }: { PostBody: ComponentType; onHeadings: (headings: ArticleHeading[]) => void }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const headings = Array.from(bodyRef.current?.querySelectorAll<HTMLHeadingElement>("h2, h3") ?? []);
    const usedIds = new Set<string>();
    const articleHeadings = headings.map((heading) => {
      const label = heading.textContent?.trim() || "Section";
      const existingId = heading.id.trim();
      const id = existingId && !usedIds.has(existingId) ? existingId : createHeadingId(label, usedIds);
      usedIds.add(id);
      heading.id = id;
      heading.classList.add("scroll-mt-24");
      ensureHeadingLink(heading, label, id);
      const level: 2 | 3 = heading.tagName === "H3" ? 3 : 2;
      return { id, label, level };
    });
    onHeadings(articleHeadings);
  }, [PostBody, onHeadings]);

  return <div ref={bodyRef}><PostBody /></div>;
}

function ArticleTableOfContents({ headings }: { headings: ArticleHeading[] }) {
  const [activeId, setActiveId] = useState(headings[0]?.id);

  useEffect(() => {
    setActiveId(headings[0]?.id);
    function updateActiveHeading() {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        setActiveId(headings.at(-1)?.id ?? headings[0]?.id);
        return;
      }
      const current = headings.reduce<ArticleHeading | undefined>((selected, heading) => {
        const element = document.getElementById(heading.id);
        return element && element.getBoundingClientRect().top <= 128 ? heading : selected;
      }, undefined);
      setActiveId(current?.id ?? headings[0]?.id);
    }
    updateActiveHeading();
    window.addEventListener("scroll", updateActiveHeading, { passive: true });
    return () => window.removeEventListener("scroll", updateActiveHeading);
  }, [headings]);

  if (!headings.length) return null;
  return (
    <nav aria-label="Table of contents" className="blog-toc">
      <p className="text-sm font-semibold text-foreground">On this page</p>
      <ol className="mt-4 space-y-2">
        {headings.map((heading) => (
          <li key={heading.id} className={heading.level === 3 ? "pl-4" : undefined}>
            <a
              href={`#${heading.id}`}
              aria-current={activeId === heading.id ? "location" : undefined}
              className={`block text-sm leading-5 transition-colors ${activeId === heading.id ? "font-medium text-brand" : "text-muted-foreground hover:text-foreground"}`}
            >
              {heading.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ArticleCover({ post, compact = false }: { post: BlogPost; compact?: boolean }) {
  if (post.image) {
    return <img src={post.image} alt="" className={`blog-cover-image${compact ? " blog-cover-card" : ""}`} />;
  }

  return (
    <div className={`blog-cover${compact ? " blog-cover-card" : ""}`} aria-label={`${post.title} cover`}>
      <div className="blog-cover-grid" aria-hidden="true" />
      <div className="blog-cover-orbit blog-cover-orbit-one" aria-hidden="true" />
      <div className="blog-cover-orbit blog-cover-orbit-two" aria-hidden="true" />
      <div className={`relative z-10 flex h-full flex-col justify-between ${compact ? "blog-cover-card-content" : "p-7 sm:p-10"}`}>
        <div className="flex items-center justify-between gap-4">
          <span className={compact ? "text-[11px] font-medium text-white/75" : "text-sm font-medium text-white/75"}>{post.category}</span>
          <Logo size={compact ? "xs" : "sm"} variant="light" />
        </div>
        <p className={compact ? "max-w-3xl text-balance font-heading text-xl font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-2xl" : "max-w-3xl text-balance font-heading text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl"}>{post.title}</p>
        <div className={compact ? "flex items-center justify-between gap-4 text-[11px] text-white/65" : "flex items-center justify-between gap-4 text-sm text-white/65"}>
          <span>{formatDate(post.date)}</span>
          <span className="hidden sm:inline">linkycal.com/blog</span>
        </div>
      </div>
    </div>
  );
}

export default function Blog() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const post = slug ? getBlogPost(slug) : undefined;
  const [loadedPost, setLoadedPost] = useState<BlogPost | undefined>(post);
  const [headings, setHeadings] = useState<ArticleHeading[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  function onGetStarted() {
    navigate("/?show_auth=true");
  }

  useEffect(() => {
    let active = true;
    setLoadedPost(post);
    setHeadings([]);
    setLoadError(null);
    if (post) {
      void loadBlogPost(post).then((loaded) => {
        if (active) setLoadedPost(loaded);
      }).catch(() => {
        if (active) setLoadError("This article could not be loaded.");
      });
    }
    return () => { active = false; };
  }, [post]);

  if (slug && !post) {
    return (
      <BlogLayout onGetStarted={onGetStarted}>
        <SEOHead title="Article not found" description="The LinkyCal article you are looking for could not be found." noIndex />
        <main className="mx-auto max-w-3xl px-6 pb-28 pt-40 text-center">
          <p className="text-sm font-semibold text-brand">404</p>
          <h1 className="mt-4 font-heading text-4xl font-semibold tracking-[-0.03em]">Article not found</h1>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">That article may have moved, or its link may be out of date.</p>
          <Button asChild className="mt-8"><Link to="/blog"><ArrowLeft /> Back to blog</Link></Button>
        </main>
      </BlogLayout>
    );
  }

  if (!post) {
    return (
      <BlogLayout onGetStarted={onGetStarted}>
        <SEOHead title="Blog" description="Practical ideas for better forms, scheduling, contacts, and workflows." canonical="https://linkycal.com/blog" />
        <main className="mx-auto max-w-6xl px-6 pb-28 pt-40">
          <div className="max-w-2xl">
            <h1 className="font-heading text-balance text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">Build clearer customer journeys.</h1>
            <p className="mt-6 text-pretty text-lg leading-8 text-muted-foreground">Ideas for teams building forms, booking flows, and the systems that connect them.</p>
          </div>
          <div className="mt-16 grid gap-5 md:grid-cols-2">
            {blogPosts.map((item) => <BlogCard key={item.slug} post={item} />)}
          </div>
        </main>
      </BlogLayout>
    );
  }

  const PostBody = loadedPost?.body;
  return (
    <BlogLayout onGetStarted={onGetStarted}>
      <SEOHead
        title={post.title}
        description={post.description}
        type="article"
        image={post.image}
        canonical={`https://linkycal.com/blog/${post.slug}`}
        structuredData={{ "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.description, datePublished: post.date, author: { "@type": "Organization", name: post.author }, url: `https://linkycal.com/blog/${post.slug}` }}
      />
      <main className="mx-auto max-w-[1240px] px-6 pb-28 pt-28 sm:pt-32">
        <Link to="/blog" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All articles</Link>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,900px)_240px] lg:items-start lg:gap-18">
          <div className="min-w-0">
            <ArticleCover post={post} />
            <div className="mt-7 max-w-3xl">
              <h1 className="text-balance font-heading text-[30px] font-semibold leading-tight tracking-[-0.03em]">{post.title}</h1>
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><span>{formatDate(post.date)}</span><span>·</span><span>By {post.author}</span></div>
              <p className="mt-4 text-lg leading-7 text-muted-foreground">{post.description}</p>
            </div>
            <div className="mb-8 mt-10 lg:hidden"><ArticleTableOfContents headings={headings} /></div>
            <div className="blog-article-body overflow-hidden text-[17px] leading-[1.75] text-foreground/85 [&_a]:font-medium [&_a]:text-brand [&_blockquote]:my-8 [&_blockquote]:rounded-[16px] [&_blockquote]:bg-muted/50 [&_blockquote]:px-5 [&_blockquote]:py-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_h2]:mb-4 [&_h2]:mt-12 [&_h2]:font-heading [&_h2]:text-[22px] [&_h2]:font-semibold [&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:font-heading [&_h3]:text-xl [&_h3]:font-semibold [&_img]:max-w-full [&_li]:ml-6 [&_ol]:my-5 [&_ol]:list-decimal [&_p]:my-5 [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-[16px] [&_pre]:bg-[#0c1410] [&_pre]:p-5 [&_pre]:text-sm [&_pre]:text-white [&_pre_code]:bg-transparent [&_strong]:font-semibold [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_ul]:my-5 [&_ul]:list-disc">
              {loadError ? <p className="text-destructive">{loadError} Refresh and try again.</p> : loadedPost?.slug === post.slug && PostBody ? <ArticleBody PostBody={PostBody} onHeadings={setHeadings} /> : <p className="text-muted-foreground">Loading article…</p>}
            </div>
          </div>
          <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto lg:block"><ArticleTableOfContents headings={headings} /></aside>
        </div>
      </main>
    </BlogLayout>
  );
}

import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { SEOHead } from "@/components/SEOHead";
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
    <Card className="group border-0 bg-muted/45 p-6 shadow-none transition-colors hover:bg-brand/5">
      <Link to={`/blog/${post.slug}`}>
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

export default function Blog() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const post = slug ? getBlogPost(slug) : undefined;
  const [loadedPost, setLoadedPost] = useState<BlogPost | undefined>(post);
  const [loadError, setLoadError] = useState<string | null>(null);
  function onGetStarted() {
    navigate("/?show_auth=true");
  }

  useEffect(() => {
    let active = true;
    setLoadedPost(post);
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
        canonical={`https://linkycal.com/blog/${post.slug}`}
        structuredData={{ "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.description, datePublished: post.date, author: { "@type": "Organization", name: post.author }, url: `https://linkycal.com/blog/${post.slug}` }}
      />
      <main className="mx-auto max-w-3xl px-6 pb-28 pt-36">
        <Link to="/blog" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All articles</Link>
        <div className="mt-12 flex items-center gap-3 text-sm text-muted-foreground"><span className="font-semibold text-brand">{post.category}</span><span>·</span><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {formatDate(post.date)}</span></div>
        <h1 className="mt-5 font-heading text-5xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">{post.title}</h1>
        <p className="mt-6 text-pretty text-xl leading-8 text-muted-foreground">{post.description}</p>
        <p className="mt-4 text-sm text-muted-foreground">By {post.author}</p>
        <div className="mt-12 overflow-hidden text-[17px] leading-8 text-foreground/85 [&_a]:font-medium [&_a]:text-brand [&_blockquote]:my-8 [&_blockquote]:rounded-[16px] [&_blockquote]:bg-muted/50 [&_blockquote]:px-6 [&_blockquote]:py-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_h2]:mb-4 [&_h2]:mt-12 [&_h2]:font-heading [&_h2]:text-3xl [&_h2]:font-semibold [&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:font-heading [&_h3]:text-2xl [&_h3]:font-semibold [&_img]:max-w-full [&_li]:ml-6 [&_ol]:my-5 [&_ol]:list-decimal [&_p]:my-5 [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-[16px] [&_pre]:bg-[#0c1410] [&_pre]:p-5 [&_pre]:text-sm [&_pre]:text-white [&_pre_code]:bg-transparent [&_strong]:font-semibold [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_ul]:my-5 [&_ul]:list-disc">
          {loadError ? <p className="text-destructive">{loadError} Refresh and try again.</p> : PostBody ? <PostBody /> : <p className="text-muted-foreground">Loading article…</p>}
        </div>
      </main>
    </BlogLayout>
  );
}

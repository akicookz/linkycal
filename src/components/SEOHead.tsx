import { Helmet } from "react-helmet-async";

interface SEOHeadProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
  noIndex?: boolean;
  canonical?: string;
}

const DEFAULT_TITLE = "LinkyCal - Forms & Scheduling infrastructure";
const DEFAULT_DESCRIPTION =
  "LinkyCal is a form and scheduling infrastructure for modern teams. Build multi-step forms, share booking links, manage contacts, and automate workflows.";
const DEFAULT_IMAGE = "/og-image.png";
const SITE_NAME = "LinkyCal";

export function SEOHead({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  noIndex = false,
  canonical,
}: SEOHeadProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const pageUrl =
    url ?? (typeof window !== "undefined" ? window.location.href : undefined);
  const canonicalUrl = canonical ?? pageUrl;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      {image && <meta property="og:image" content={image} />}
      {pageUrl && <meta property="og:url" content={pageUrl} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}
    </Helmet>
  );
}

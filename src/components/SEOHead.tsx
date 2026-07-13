import { Helmet } from "react-helmet-async";

interface SEOHeadProps {
  title?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  url?: string;
  type?: "website" | "article";
  noIndex?: boolean;
  canonical?: string;
  structuredData?: Record<string, unknown>;
}

const SITE_URL = "https://linkycal.com";
const DEFAULT_TITLE = "LinkyCal - Forms & Scheduling Infrastructure";
const DEFAULT_DESCRIPTION =
  "LinkyCal is a form and scheduling infrastructure for modern teams. Build multi-step forms, share booking links, manage contacts, and automate workflows.";
const DEFAULT_IMAGE = "/og-image.png";
const DEFAULT_IMAGE_ALT =
  "LinkyCal headless forms and scheduling product preview";
const SITE_NAME = "LinkyCal";

function absoluteUrl(value: string): string {
  try {
    return new URL(value).toString();
  } catch {
    return new URL(value, SITE_URL).toString();
  }
}

function serializeStructuredData(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function SEOHead({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  imageAlt = DEFAULT_IMAGE_ALT,
  url,
  type = "website",
  noIndex = false,
  canonical,
  structuredData,
}: SEOHeadProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const pageUrl = absoluteUrl(
    url ?? (typeof window !== "undefined" ? window.location.href : SITE_URL),
  );
  const canonicalUrl = canonical ? absoluteUrl(canonical) : pageUrl;
  const imageUrl = image ? absoluteUrl(image) : undefined;
  const usesDefaultImage = imageUrl === absoluteUrl(DEFAULT_IMAGE);

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="theme-color" content="#1B4332" />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      {imageUrl && <meta property="og:image" content={imageUrl} />}
      {imageUrl && <meta property="og:image:secure_url" content={imageUrl} />}
      {usesDefaultImage && <meta property="og:image:width" content="1200" />}
      {usesDefaultImage && <meta property="og:image:height" content="630" />}
      {imageUrl && <meta property="og:image:alt" content={imageAlt} />}
      <meta property="og:url" content={pageUrl} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {imageUrl && <meta name="twitter:image" content={imageUrl} />}
      {imageUrl && <meta name="twitter:image:alt" content={imageAlt} />}

      {structuredData && (
        <script type="application/ld+json">
          {serializeStructuredData(structuredData)}
        </script>
      )}
    </Helmet>
  );
}

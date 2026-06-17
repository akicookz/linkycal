import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

interface LegalSection {
  heading: string;
  paragraphs: string[];
}

interface LegalDoc {
  title: string;
  description: string;
  intro: string;
  sections: LegalSection[];
}

const LAST_UPDATED = "June 17, 2026";

const PRIVACY: LegalDoc = {
  title: "Privacy Policy",
  description:
    "How LinkyCal collects, uses, and protects your information, and the choices you have.",
  intro:
    "This Privacy Policy explains what information LinkyCal collects, how we use it, and the choices you have. LinkyCal is a form and scheduling product operated by LaunchFast. By using LinkyCal you agree to the practices described here.",
  sections: [
    {
      heading: "Information we collect",
      paragraphs: [
        "Account information. When you sign up we collect your name, email address, and authentication details from Google, Facebook, or our email one-time code flow.",
        "Content you create. Forms, event types, availability, contacts, and workflows that you build inside LinkyCal are stored so we can provide the service.",
        "Submissions from your visitors. When someone fills in one of your forms or books a meeting, we store the information they provide so we can deliver it to you. You are responsible for what you collect through your forms.",
        "Usage and device data. We collect basic analytics such as pages viewed, approximate location, browser type, and IP address to keep the service secure and to improve it.",
        "Cookies. We use cookies to keep you signed in and to understand how the product is used.",
      ],
    },
    {
      heading: "How we use information",
      paragraphs: [
        "To provide and maintain the service, including building forms, taking bookings, syncing calendars, and running workflows.",
        "To send transactional messages such as confirmations, reminders, and account notices.",
        "To secure the service, prevent abuse, and troubleshoot problems.",
        "To improve features and understand what is working.",
      ],
    },
    {
      heading: "How we share information",
      paragraphs: [
        "We do not sell your personal information. We share data only with service providers that help us run LinkyCal, and only as needed.",
        "These providers include Cloudflare for hosting and storage, Stripe for payments, Resend for email delivery, and Google for calendar sync when you connect it.",
        "We may disclose information if required by law, or to protect the rights and safety of our users.",
      ],
    },
    {
      heading: "Data retention",
      paragraphs: [
        "We keep your data for as long as your account is active. When you delete content or close your account, we remove the associated data within a reasonable period, except where we must keep records to meet legal obligations.",
      ],
    },
    {
      heading: "Your rights",
      paragraphs: [
        "Depending on where you live, you may have the right to access, correct, export, or delete your personal information. You can manage most of this from your account, or contact us and we will help.",
      ],
    },
    {
      heading: "Security",
      paragraphs: [
        "We use industry standard measures to protect your data, including encryption in transit and access controls. No system is perfectly secure, so we cannot guarantee absolute security.",
      ],
    },
    {
      heading: "International transfers",
      paragraphs: [
        "LinkyCal runs on global infrastructure, so your data may be processed in countries other than your own. We take steps to keep it protected wherever it is handled.",
      ],
    },
    {
      heading: "Children",
      paragraphs: [
        "LinkyCal is not intended for children under 16, and we do not knowingly collect their information.",
      ],
    },
    {
      heading: "Changes to this policy",
      paragraphs: [
        "We may update this policy from time to time. When we make material changes, we will update the date above and, where appropriate, let you know.",
      ],
    },
  ],
};

const TERMS: LegalDoc = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of LinkyCal, including accounts, billing, and acceptable use.",
  intro:
    "These Terms of Service govern your use of LinkyCal. LinkyCal is operated by LaunchFast. By creating an account or using the service, you agree to these terms. If you do not agree, please do not use LinkyCal.",
  sections: [
    {
      heading: "The service",
      paragraphs: [
        "LinkyCal provides forms, scheduling, contact management, workflows, an API, and embeddable widgets. We may add, change, or remove features over time.",
      ],
    },
    {
      heading: "Your account",
      paragraphs: [
        "You are responsible for your account and for keeping your login secure. You must provide accurate information, and you must be old enough to enter into a contract in your country.",
      ],
    },
    {
      heading: "Acceptable use",
      paragraphs: [
        "You agree not to use LinkyCal to break the law, send spam, infringe the rights of others, or disrupt the service. You are responsible for the content you collect and for complying with the privacy and anti-spam rules that apply to you.",
      ],
    },
    {
      heading: "Plans, billing, and refunds",
      paragraphs: [
        "LinkyCal offers Free, Pro, and Business plans. Paid plans are billed through Stripe on the cycle you choose. Fees are charged in advance and are non-refundable except where required by law.",
        "You can upgrade, downgrade, or cancel at any time. Cancelling stops future charges, and your plan stays active until the end of the current period.",
      ],
    },
    {
      heading: "Your content and data",
      paragraphs: [
        "You keep ownership of the forms, bookings, contacts, and other content you create. You grant us the limited rights needed to host and operate the service on your behalf.",
      ],
    },
    {
      heading: "Our intellectual property",
      paragraphs: [
        "LinkyCal, including its software, design, and brand, belongs to us. These terms do not give you any rights to our intellectual property beyond using the service as intended.",
      ],
    },
    {
      heading: "Third-party services",
      paragraphs: [
        "LinkyCal connects to services such as Google Calendar and Stripe. Your use of those services is governed by their own terms, and we are not responsible for them.",
      ],
    },
    {
      heading: "Availability and changes",
      paragraphs: [
        "We work to keep LinkyCal available and reliable, but we do not promise uninterrupted service. We may perform maintenance or change the service as needed.",
      ],
    },
    {
      heading: "Disclaimer",
      paragraphs: [
        "LinkyCal is provided on an as is and as available basis, without warranties of any kind to the extent allowed by law.",
      ],
    },
    {
      heading: "Limitation of liability",
      paragraphs: [
        "To the maximum extent permitted by law, LinkyCal and LaunchFast are not liable for indirect, incidental, or consequential damages, and our total liability is limited to the amount you paid us in the twelve months before the claim.",
      ],
    },
    {
      heading: "Termination",
      paragraphs: [
        "You may stop using LinkyCal at any time. We may suspend or end your access if you breach these terms or use the service in a way that creates risk for us or other users.",
      ],
    },
    {
      heading: "Governing law",
      paragraphs: [
        "These terms are governed by the laws that apply where LaunchFast operates, without regard to conflict of law rules.",
      ],
    },
    {
      heading: "Changes to these terms",
      paragraphs: [
        "We may update these terms from time to time. When we make material changes, we will update the date above and let you know where appropriate.",
      ],
    },
  ],
};

interface LegalPageProps {
  kind: "privacy" | "terms";
}

export default function LegalPage({ kind }: LegalPageProps) {
  const navigate = useNavigate();
  const doc = kind === "privacy" ? PRIVACY : TERMS;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [kind]);

  const onGetStarted = useCallback(() => {
    navigate("/?show_auth=true");
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-clip">
      <SEOHead
        title={doc.title}
        description={doc.description}
        canonical={`https://linkycal.com/${kind}`}
      />

      <MarketingNav onGetStarted={onGetStarted} />

      <section className="relative pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-heading text-[2.5rem] sm:text-[3rem] font-bold tracking-[-0.03em] leading-[1.05] text-foreground">
            {doc.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-3">
            Last updated: {LAST_UPDATED}
          </p>
          <p className="text-lg text-muted-foreground leading-relaxed mt-6">
            {doc.intro}
          </p>

          <div className="mt-10 space-y-9">
            {doc.sections.map((section) => (
              <div key={section.heading}>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  {section.heading}
                </h2>
                <div className="space-y-3">
                  {section.paragraphs.map((paragraph, i) => (
                    <p
                      key={i}
                      className="text-[15px] text-muted-foreground leading-relaxed"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[15px] text-muted-foreground leading-relaxed mt-12">
            Questions about this{" "}
            {kind === "privacy" ? "policy" : "agreement"}? Email us at{" "}
            <a
              href="mailto:hello@linkycal.com"
              className="text-brand hover:text-foreground transition-colors"
            >
              hello@linkycal.com
            </a>
            .
          </p>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

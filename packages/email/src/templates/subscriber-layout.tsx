import { Body } from "@react-email/body";
import { Container } from "@react-email/container";
import { Head } from "@react-email/head";
import { Html } from "@react-email/html";
import { Link } from "@react-email/link";
import { render } from "@react-email/render";
import { Text } from "@react-email/text";
import * as React from "react";

export interface SubscriberLayoutTheme {
  fontFamily: string;
  textColor: string;
  headingColor: string;
  mutedColor: string;
  borderColor: string;
  linkColor: string;
  accentColor: string;
  backgroundColor: string;
}

export const defaultSubscriberLayoutTheme: SubscriberLayoutTheme = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif',
  textColor: "#3c4149",
  headingColor: "#111113",
  mutedColor: "#8a8f98",
  borderColor: "#e6e6e9",
  linkColor: "#0670DB",
  accentColor: "#111113",
  backgroundColor: "#ffffff",
};

export interface SubscriberLayoutProps {
  bodyHtml: string;
  unsubscribeUrl?: string;
  theme?: SubscriberLayoutTheme;
}

const contentStyles = (theme: SubscriberLayoutTheme) => `
  .content { font-family: ${theme.fontFamily}; font-size: 14px; line-height: 22px; color: ${theme.textColor}; }
  .content p { margin: 0 0 14px; }
  .content h1, .content h2, .content h3 { color: ${theme.headingColor}; font-weight: 600; }
  .content h1 { font-size: 20px; line-height: 28px; letter-spacing: -0.3px; margin: 0 0 14px; }
  .content h2 { font-size: 16px; line-height: 24px; letter-spacing: -0.1px; margin: 22px 0 6px; }
  .content h3 { font-size: 14px; line-height: 22px; margin: 18px 0 4px; }
  .content a { color: ${theme.linkColor}; text-decoration: underline; text-underline-offset: 2px; }
  .content a.button { display: inline-block; background-color: ${theme.accentColor}; color: #ffffff !important; text-decoration: none; font-size: 13px; font-weight: 500; line-height: 20px; padding: 8px 16px; border-radius: 6px; margin: 2px 0 14px; }
  .content ul, .content ol { margin: 0 0 14px; padding-left: 20px; }
  .content li { margin: 0 0 4px; }
  .content img { max-width: 100%; height: auto; border-radius: 6px; }
  .content hr { border: none; border-top: 1px solid ${theme.borderColor}; margin: 24px 0; }
  .content blockquote { margin: 0 0 14px; padding-left: 16px; border-left: 3px solid ${theme.borderColor}; color: ${theme.mutedColor}; }
  .content code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; background-color: #f4f4f5; padding: 2px 4px; border-radius: 4px; }
  @media only screen and (max-width: 600px) {
    .container { padding: 32px 20px !important; }
  }
`;

export const SubscriberLayout = ({
  bodyHtml,
  unsubscribeUrl,
  theme = defaultSubscriberLayoutTheme,
}: SubscriberLayoutProps) => (
  <Html>
    <Head>
      <meta name="color-scheme" content="light" />
      <style dangerouslySetInnerHTML={{ __html: contentStyles(theme) }} />
    </Head>
    <Body style={{ backgroundColor: theme.backgroundColor, margin: 0 }}>
      <Container
        className="container"
        style={{ maxWidth: "600px", padding: "48px 24px 64px" }}
      >
        <div
          className="content"
          style={{
            fontFamily: theme.fontFamily,
            fontSize: "14px",
            lineHeight: "22px",
            color: theme.textColor,
          }}
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
        {unsubscribeUrl && (
          <Text
            style={{
              fontFamily: theme.fontFamily,
              fontSize: "11px",
              lineHeight: "16px",
              color: theme.textColor,
              margin: "32px 0 0",
            }}
          >
            Don&apos;t want these emails?{" "}
            <Link
              href={unsubscribeUrl}
              style={{ color: theme.linkColor, textDecoration: "underline" }}
            >
              Unsubscribe
            </Link>
          </Text>
        )}
      </Container>
    </Body>
  </Html>
);

SubscriberLayout.PreviewProps = {
  bodyHtml: `<h1>Welcome to Acme, Alice</h1>
<p>Thanks for starting your trial. You've got 14 days to try everything. Here's the fastest way to get set up:</p>
<ul><li>Connect your first integration</li><li>Import your subscribers</li><li>Send a test workflow to yourself</li></ul>
<a class="button" href="https://example.com/onboarding">Get started</a>
<h2>Need a hand?</h2>
<p>Reply to this email and it'll come straight to us, or <a href="https://example.com/docs">read the docs</a>.</p>
<p>Cheers,<br />The Acme team</p>`,
  unsubscribeUrl: "https://example.com/unsubscribe?token=abc",
} satisfies SubscriberLayoutProps;

export const renderSubscriberEmail = (props: SubscriberLayoutProps) =>
  render(<SubscriberLayout {...props} />);

export default SubscriberLayout;

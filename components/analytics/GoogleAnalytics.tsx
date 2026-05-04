"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getClientId, getSessionId } from "@/utils/analytics";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type GoogleAnalyticsProps = {
  measurementId?: string;
};

export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname();

  // Stamp every event with our anonymous client/session ids. This lets us build
  // funnels and per-user retention reports in GA4 without collecting any PII.
  useEffect(() => {
    if (!measurementId || typeof window === "undefined" || !window.gtag) return;
    const cid = getClientId();
    const sid = getSessionId();
    if (cid) {
      window.gtag("set", { user_id: cid });
      window.gtag("set", "user_properties", { app_client_id: cid });
    }
    if (sid) {
      window.gtag("set", "user_properties", { app_session_id: sid });
    }
  }, [measurementId]);

  useEffect(() => {
    if (!measurementId || !window.gtag) {
      return;
    }

    const query = window.location.search.replace(/^\?/, "");
    const pagePath = query ? `${pathname}?${query}` : pathname;

    window.gtag("event", "page_view", {
      page_path: pagePath,
      page_location: window.location.href,
      client_id: getClientId(),
      session_id: getSessionId(),
    });
  }, [measurementId, pathname]);

  if (!measurementId) {
    return null;
  }

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}

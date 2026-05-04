import "./globals.css";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { PlayerBar } from "@/components/player/PlayerBar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { Footer } from "@/components/footer/Footer";
import { PrebuiltPlaylistsSync } from "@/components/playlists/PrebuiltPlaylistsSync";
import { config } from "@fortawesome/fontawesome-svg-core";
import type { Viewport } from "next";
import { Roboto, Roboto_Condensed } from "next/font/google";

config.autoAddCss = false;

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-roboto",
});

const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-roboto-condensed",
});

export const metadata = {
  title: "KGLW FM",
  description: "Live archive player for King Gizzard & The Lizard Wizard",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <html lang="en">
      <body
        className={`${roboto.variable} ${robotoCondensed.variable} min-h-screen bg-[#080017] text-white`}
      >
        <PrebuiltPlaylistsSync />
        <div className="w-full bg-[#080017] pb-44 md:pt-16">
          {children}
          <Footer />
        </div>
        <BottomNav />
        <PlayerBar />
        <GoogleAnalytics measurementId={gaMeasurementId} />
      </body>
    </html>
  );
}

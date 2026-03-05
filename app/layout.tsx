import "./globals.css";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { PlayerBar } from "@/components/player/PlayerBar";
import { BottomNav } from "@/components/navigation/BottomNav";
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
  title: "KGLW-Listen",
  description: "Live archive player for King Gizzard & The Lizard Wizard",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${roboto.variable} ${robotoCondensed.variable} min-h-screen bg-black text-white`}
      >
        <PrebuiltPlaylistsSync />
        <div className="w-full pb-44">{children}</div>
        <BottomNav />
        <PlayerBar />
      </body>
    </html>
  );
}

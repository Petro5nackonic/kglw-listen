import "./globals.css";
import { PlayerBar } from "@/components/player/PlayerBar";
import { Roboto, Roboto_Condensed } from "next/font/google";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${roboto.variable} ${robotoCondensed.variable} min-h-screen bg-black text-white`}
      >
        <div className="w-full pb-28">{children}</div>
        <PlayerBar />
      </body>
    </html>
  );
}

import "./globals.css";
import { PlayerBar } from "@/components/player/PlayerBar";

export const metadata = {
  title: "KGLW-Listen",
  description: "Live archive player for King Gizzard & The Lizard Wizard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-3xl p-4 pb-28">{children}</div>
        <PlayerBar />
      </body>
    </html>
  );
}

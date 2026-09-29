import type { Metadata } from "next";
import { PlayView } from "./play-view";

export const metadata: Metadata = { title: "Play Day | VoltGrid" };

export default function PlayPage() {
  return <PlayView />;
}

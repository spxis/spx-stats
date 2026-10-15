import { SportMark } from "@/components/SportMark";

/** Soccer's pages carry the soccer mark: the header swoosh's centre takes soccer's colour (components/SportMark.tsx). */
export default function SoccerLayout({ children }: { children: React.ReactNode }) {
  return <SportMark sport="soccer">{children}</SportMark>;
}

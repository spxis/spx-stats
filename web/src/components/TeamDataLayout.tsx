import type { ReactNode } from "react";
import { TeamData } from "./TeamData";

/** A layout for the pages of a section that name teams of any league (components/TeamData.tsx): `export { default } from "@/components/TeamDataLayout";`. */
export default function TeamDataLayout({ children }: { children: ReactNode }) {
  return <TeamData>{children}</TeamData>;
}

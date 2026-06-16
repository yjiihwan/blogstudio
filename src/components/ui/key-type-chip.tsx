import { Server, UserRound } from "lucide-react";

export function SystemChip() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide shrink-0"
      style={{ backgroundColor: "#1D2B4E", color: "#F6F5F0" }}
    >
      <Server className="size-3" />
      시스템
    </span>
  );
}

export function PersonalChip() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide border shrink-0"
      style={{ borderColor: "#2EB8A0", color: "#2EB8A0" }}
    >
      <UserRound className="size-3" />
      개인
    </span>
  );
}

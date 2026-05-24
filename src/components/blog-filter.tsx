"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function BlogFilter({
  blogs,
  selected,
  currentStatus,
}: {
  blogs: { id: string; name: string }[];
  selected?: string;
  currentStatus?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  return (
    <select
      className="h-9 rounded-full border border-paper-300 bg-paper-50 px-3 text-xs"
      defaultValue={selected ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.currentTarget.value) next.set("blog", e.currentTarget.value);
        else next.delete("blog");
        if (currentStatus) next.set("status", currentStatus);
        const qs = next.toString();
        router.push(`${pathname}${qs ? `?${qs}` : ""}`);
      }}
    >
      <option value="">모든 블로그</option>
      {blogs.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}

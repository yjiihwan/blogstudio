const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export function parseCronToHuman(cron: string): string {
  try {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return cron;
    const [, hour, , , dow] = parts;
    const h = parseInt(hour);
    const timeStr =
      h === 0 ? "자정" : h < 12 ? `오전 ${h}시` : h === 12 ? "낮 12시" : `오후 ${h - 12}시`;
    if (dow === "*") return `매일 ${timeStr}`;
    const days = dow
      .split(",")
      .map((d) => DAY_NAMES[parseInt(d.trim())])
      .filter(Boolean);
    const suffix = days.length === 1 ? `${days[0]}요일` : `${days.join("·")}요일`;
    const freq = days.length > 1 ? `주 ${days.length}회` : "매주";
    return `${freq} ${suffix} ${timeStr}`;
  } catch {
    return cron;
  }
}

export function pickerToCron(days: number[], hour: number): string {
  if (days.length === 0 || days.length === 7) return `0 ${hour} * * *`;
  return `0 ${hour} * * ${days.sort((a, b) => a - b).join(",")}`;
}

export function cronToPicker(cron: string): { days: number[]; hour: number } {
  try {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return { days: [1], hour: 7 };
    const [, hour, , , dow] = parts;
    const h = parseInt(hour);
    const hourNum = isNaN(h) ? 7 : h;
    if (dow === "*") return { days: [], hour: hourNum };
    const days = dow
      .split(",")
      .map((d) => parseInt(d.trim()))
      .filter((n) => !isNaN(n) && n >= 0 && n <= 6);
    return { days: days.length ? days : [1], hour: hourNum };
  } catch {
    return { days: [1], hour: 7 };
  }
}

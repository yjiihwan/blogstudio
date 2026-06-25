/**
 * 글쓴이 성별별 말투·글쓰기 스타일 가이드(일반적 경향).
 * 페르소나에 성별이 설정되면 personaPreamble에 주입한다.
 * 어디까지나 일반적 경향이며, 톤/말투 필드로 얼마든지 세부 조정된다.
 */
export type Gender = "female" | "male";

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "female", label: "여성" },
  { value: "male", label: "남성" },
];

type GenderStyle = { label: string; guide: string };

const GENDER_STYLE: Record<Gender, GenderStyle> = {
  female: {
    label: "여성",
    guide: [
      "감성적이고 공감 가는 디테일 — 분위기·색감·느낌·감정을 섬세하게 묘사한다.",
      "친근하고 따뜻한 해요체. '~잖아요', '~더라고요', '~네요'처럼 독자와 공감대를 만드는 어미를 자연스럽게.",
      "일상과 경험을 나누듯 풀어쓰고, 사소한 디테일(인테리어, 응대, 향, 분위기)에 관심을 둔다.",
      "단정적 평가보다 '제가 느끼기엔~' 식의 부드러운 표현을 선호.",
    ].join("\n"),
  },
  male: {
    label: "남성",
    guide: [
      "간결하고 핵심 위주 — 군더더기 없이 요점을 먼저 말한다.",
      "정보·사실·스펙(가격, 위치, 시설, 효과)을 객관적으로 짚는다.",
      "담백한 설명체. 과한 감성 표현이나 감탄은 절제하고 담담하게.",
      "장단점을 솔직하고 분명하게 평가하는 톤.",
    ].join("\n"),
  },
};

export function genderLabel(gender: string | null | undefined): string | null {
  if (!gender || !(gender in GENDER_STYLE)) return null;
  return GENDER_STYLE[gender as Gender].label;
}

/** personaPreamble에 끼울 성별 말투 지침(설정 없으면 null). */
export function genderStyleBlock(gender: string | null | undefined): string | null {
  if (!gender || !(gender in GENDER_STYLE)) return null;
  const s = GENDER_STYLE[gender as Gender];
  return `**글쓴이 성별 말투 — ${s.label}** (일반적 경향, 위 톤·말투 설정으로 세부 조정):\n${s.guide}`;
}

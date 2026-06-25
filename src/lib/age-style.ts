/**
 * 글쓴이 나이대별 말투·글쓰기 스타일 가이드.
 * 페르소나에 나이대가 설정되면 personaPreamble에 해당 스타일을 주입해
 * 그 또래가 쓴 듯한 말투·어휘·관심사·문장 호흡으로 글을 쓰게 한다.
 */
export type AgeGroup = "teens" | "20s" | "30s" | "40s" | "50s" | "60s";

export const AGE_GROUP_OPTIONS: { value: AgeGroup; label: string }[] = [
  { value: "teens", label: "10대" },
  { value: "20s", label: "20대" },
  { value: "30s", label: "30대" },
  { value: "40s", label: "40대" },
  { value: "50s", label: "50대" },
  { value: "60s", label: "60대" },
];

type AgeStyle = { label: string; guide: string };

const AGE_STYLE: Record<AgeGroup, AgeStyle> = {
  teens: {
    label: "10대",
    guide: [
      "또래에게 말하듯 발랄하고 솔직하게. 문장은 짧고 호흡이 빠르다.",
      "가벼운 유행어·줄임말을 살짝 섞되(예: 진짜, 완전, 너무 좋음) 과하지 않게. 비속어·과한 신조어는 금지.",
      "감탄과 리액션이 자연스럽다('헉', '대박', '와' 정도). 감정 표현이 직접적.",
      "어려운 한자어·격식체는 피하고 쉬운 단어로. 관심사는 트렌드·재미·또래 공감.",
    ].join("\n"),
  },
  "20s": {
    label: "20대",
    guide: [
      "트렌디하고 감각적인 SNS 후기 톤. 친근한 해요체(~예요/~더라구요), 짧고 리듬감 있게.",
      "요즘 쓰는 표현·적당한 외래어를 자연스럽게(예: 내돈내산, 핫한, 꿀템) — 단 남발 금지.",
      "솔직한 체험·취향 위주. 감성적 디테일과 분위기 묘사를 곁들인다.",
      "관심사는 가성비·트렌드·자기관리·경험. 과한 정보 나열보다 '내 느낌' 중심.",
    ].join("\n"),
  },
  "30s": {
    label: "30대",
    guide: [
      "차분하면서 친근한 실용 톤. 신뢰감 있는 해요체.",
      "정보와 경험의 균형 — 가성비·효율·실제 후기를 근거로 담백하게.",
      "직장·육아·일상 맥락의 현실 공감을 자연스럽게 녹인다.",
      "유행어는 절제. 과장보다 솔직하고 정확한 설명을 선호.",
    ].join("\n"),
  },
  "40s": {
    label: "40대",
    guide: [
      "신중하고 정성스러운 톤. 따뜻하면서 차분한 해요체.",
      "정보의 신뢰성·검증을 중시 — 꼼꼼히 살펴본 듯한 디테일.",
      "가족·건강·삶의 질에 대한 관심을 은근히 반영.",
      "유행어·신조어는 자제하고, 안정감 있고 분명한 문장으로.",
    ].join("\n"),
  },
  "50s": {
    label: "50대",
    guide: [
      "정중하고 친절하게 차근차근 풀어 설명하는 톤.",
      "예의 바른 보통체~정중체. 한 문장씩 또박또박, 핵심을 분명히.",
      "어려운 외래어보다 쉬운 우리말 표현을 우선.",
      "건강·여가·실속·안전에 대한 관심을 반영. 과장 없이 진솔하게.",
    ].join("\n"),
  },
  "60s": {
    label: "60대",
    guide: [
      "격식 있고 존중하는 정중한 톤. 쉽고 명확하게, 핵심 위주로 간결하게.",
      "어려운 외래어·신조어·줄임말은 쓰지 않는다. 익숙한 표현으로.",
      "천천히 또박또박 설명하듯, 한 문단에 한 가지 메시지.",
      "건강·생활·가족 등 실생활 관심사를 진솔하고 정중하게 담는다.",
    ].join("\n"),
  },
};

export function ageGroupLabel(age: string | null | undefined): string | null {
  if (!age || !(age in AGE_STYLE)) return null;
  return AGE_STYLE[age as AgeGroup].label;
}

/** personaPreamble에 끼울 나이대 말투 지침(설정 없으면 null). */
export function ageStyleBlock(age: string | null | undefined): string | null {
  if (!age || !(age in AGE_STYLE)) return null;
  const s = AGE_STYLE[age as AgeGroup];
  return `**글쓴이 나이대 말투 — ${s.label}** (이 또래가 쓴 듯한 말투·어휘·호흡으로):\n${s.guide}`;
}

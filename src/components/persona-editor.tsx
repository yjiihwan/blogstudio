"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChipsInput } from "@/components/ui/chips-input";
import { Sparkles, Info } from "lucide-react";
import { SchedulePicker } from "@/components/ui/schedule-picker";
import { AGE_GROUP_OPTIONS } from "@/lib/age-style";
import { GENDER_OPTIONS } from "@/lib/gender-style";

export type PersonaEditorValues = {
  purpose: string;
  audience: string;
  brandVoice: string;
  pointOfView: "first_person" | "owner" | "third_person" | "expert";
  formality: "informal" | "neutral" | "formal";
  ageGroup: string | null;
  gender: string | null;
  focusKeywords: string[];
  forbiddenWords: string[];
  ctas: string[];
  facilities: string[];
  absentFacilities: string[];
  preferredLengthMin: number;
  preferredLengthMax: number;
  imagesPerPostMin: number;
  imagesPerPostMax: number;
  sampleSnippets: string[];
  qualityRules: string[];
  notes: string;
};

export type BlogEditorValues = {
  naverBlogId: string;
  displayName: string;
  blogTitle: string;
  blogUrl: string;
  niche: string;
  status: "active" | "paused" | "archived";
  cron: string;
  jitterMin: number;
};

export function PersonaEditor({
  mode,
  action,
  blog,
  persona,
}: {
  mode: "create" | "edit";
  action: (formData: FormData) => void;
  blog: BlogEditorValues;
  persona: PersonaEditorValues;
}) {
  const [pov, setPov] = useState(persona.pointOfView);
  const [formality, setFormality] = useState(persona.formality);
  const [ageGroup, setAgeGroup] = useState(persona.ageGroup ?? "");
  const [gender, setGender] = useState(persona.gender ?? "");

  return (
    <form action={action} className="space-y-5 max-w-3xl">
      {/* ============== BLOG INFO ============== */}
      <Section
        title="블로그 기본 정보"
        desc="네이버 블로그 식별과 어드민 내에서 표시될 이름입니다."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            name="naverBlogId"
            label="네이버 블로그 ID"
            defaultValue={blog.naverBlogId}
            required
            placeholder="예: my_blog_id"
            hint="blog.naver.com/<이부분>"
          />
          <Field
            name="status"
            label="상태"
            render={
              <Select id="status" name="status" defaultValue={blog.status}>
                <option value="active">활성 (자동 생성 ON)</option>
                <option value="paused">일시정지</option>
                <option value="archived">보관</option>
              </Select>
            }
          />
        </div>
        <Field
          name="displayName"
          label="어드민 표시명"
          defaultValue={blog.displayName}
          required
          placeholder="예: 브랜드 본사 블로그"
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            name="blogTitle"
            label="실제 블로그 제목"
            defaultValue={blog.blogTitle}
          />
          <Field
            name="niche"
            label="니치 / 주제 카테고리"
            defaultValue={blog.niche}
            placeholder="예: 음식점·F&B, 부동산, 라이프스타일"
          />
        </div>
        <Field
          name="blogUrl"
          label="블로그 URL"
          defaultValue={blog.blogUrl}
          placeholder="https://blog.naver.com/..."
        />
      </Section>

      {/* ============== BRAND BRIEF ============== */}
      <Section
        title="브랜드 브리프"
        desc="이 블로그가 '왜 존재하는지' AI에게 알려주는 가장 중요한 정보입니다. 마치 새로 입사한 작가에게 설명한다고 생각해주세요."
        accent
      >
        <Field
          name="purpose"
          label="블로그의 목적"
          render={
            <Textarea
              id="purpose"
              name="purpose"
              defaultValue={persona.purpose}
              rows={3}
              placeholder="이 블로그를 왜 운영하나요? 독자에게 무엇을 주고 싶나요? 비즈니스 목표가 있나요?"
            />
          }
        />
        <Field
          name="audience"
          label="타겟 독자"
          render={
            <Textarea
              id="audience"
              name="audience"
              defaultValue={persona.audience}
              rows={2}
              placeholder="누가 이 블로그를 읽었으면 하나요? 연령·지역·관심사·상황을 구체적으로."
            />
          }
        />
        <Field
          name="brandVoice"
          label="톤 / 말투"
          render={
            <Textarea
              id="brandVoice"
              name="brandVoice"
              defaultValue={persona.brandVoice}
              rows={3}
              placeholder="예) 친근한 동료가 이야기해주듯 — 과장 없이 솔직, 정보는 정확하게."
            />
          }
        />

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>화법</Label>
            <SegmentChoice
              value={pov}
              onChange={(v) => setPov(v as any)}
              options={[
                { value: "first_person", label: "고객 1인칭 (제가 가보니…)" },
                { value: "owner", label: "운영자·직원 (저희 매장에서…)" },
                { value: "third_person", label: "3인칭 (담담한 관찰자)" },
                { value: "expert", label: "전문가 (분석·해설)" },
              ]}
            />
            <input type="hidden" name="pointOfView" value={pov} />
          </div>
          <div className="space-y-2">
            <Label>격식</Label>
            <SegmentChoice
              value={formality}
              onChange={(v) => setFormality(v as any)}
              options={[
                { value: "informal", label: "친근체" },
                { value: "neutral", label: "보통체" },
                { value: "formal", label: "정중체" },
              ]}
            />
            <input type="hidden" name="formality" value={formality} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ageGroup">글쓴이 나이대</Label>
            <Select
              id="ageGroup"
              name="ageGroup"
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
            >
              <option value="">미설정 (기본 톤)</option>
              {AGE_GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gender">글쓴이 성별</Label>
            <Select
              id="gender"
              name="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">미설정 (기본 톤)</option>
              {GENDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Hint>
          나이대·성별의 일반적인 말투·스타일로 글을 씁니다(예: 20대 여성=감성적인 트렌디 후기 톤). 미설정이면 기본 톤. 톤/말투 설정으로 세부 조정됩니다.
        </Hint>
      </Section>

      {/* ============== KEYWORDS ============== */}
      <Section
        title="키워드 전략"
        desc="네이버 검색 노출을 위한 핵심 키워드와, 절대 쓰지 않을 단어."
      >
        <div className="space-y-2">
          <Label htmlFor="focusKeywords">핵심 키워드</Label>
          <ChipsInput
            name="focusKeywords"
            defaultValue={persona.focusKeywords}
            placeholder="예: 강남 점심, 직화구이…"
          />
          <Hint>AI가 주제 선정·제목·본문에 우선 반영합니다.</Hint>
        </div>
        <div className="space-y-2">
          <Label htmlFor="forbiddenWords">금지어</Label>
          <ChipsInput
            name="forbiddenWords"
            defaultValue={persona.forbiddenWords}
            tone="neutral"
            placeholder="예: 최고, 최저가, 100%…"
          />
          <Hint>
            과장 표현·광고티 나는 단어를 막아 저품질 신호를 줄여줍니다.
          </Hint>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ctas">호출 문구 (CTA)</Label>
          <ChipsInput
            name="ctas"
            defaultValue={persona.ctas}
            tone="neutral"
            placeholder="글 말미에 자연스럽게 들어갈 안내 문구"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="facilities">제공 시설·프로그램 (확정)</Label>
          <ChipsInput
            name="facilities"
            defaultValue={persona.facilities}
            tone="neutral"
            placeholder="예: 웨이트, 머신, GX, 1:1 PT…"
          />
          <Hint>
            실제로 제공하는 시설·프로그램만 적으세요. AI는 이 목록 안에서만 시설을
            언급합니다.
          </Hint>
        </div>
        <div className="space-y-2">
          <Label htmlFor="absentFacilities">없는 시설 (언급 금지)</Label>
          <ChipsInput
            name="absentFacilities"
            defaultValue={persona.absentFacilities}
            tone="neutral"
            placeholder="예: 수영장, 수영, 사우나, 스파, 골프…"
          />
          <Hint>
            없는데 오해할 수 있는 시설을 적으면, AI가 주제·제목·본문에 지어내지
            못하도록 막고 발행 전 검출합니다.
          </Hint>
        </div>
      </Section>

      {/* ============== FORMAT RULES ============== */}
      <Section
        title="포맷 규칙"
        desc="네이버 알고리즘이 선호하는 글 길이·이미지 수를 정해둡니다."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field
            name="preferredLengthMin"
            label="본문 최소 자수"
            type="number"
            defaultValue={String(persona.preferredLengthMin)}
            min={500}
          />
          <Field
            name="preferredLengthMax"
            label="본문 최대 자수"
            type="number"
            defaultValue={String(persona.preferredLengthMax)}
            min={1000}
          />
          <Field
            name="imagesPerPostMin"
            label="최소 이미지 수"
            type="number"
            defaultValue={String(persona.imagesPerPostMin)}
            min={1}
          />
          <Field
            name="imagesPerPostMax"
            label="최대 이미지 수"
            type="number"
            defaultValue={String(persona.imagesPerPostMax)}
            min={1}
          />
        </div>
      </Section>

      {/* ============== STYLE SAMPLES ============== */}
      <Section
        title="스타일 샘플 (선택)"
        desc="AI가 따라할 톤을 보여주는 짧은 글 조각 1~3개. 직접 쓴 글에서 발췌해주세요."
      >
        <div className="space-y-2">
          <Field
            name="sampleSnippet1"
            label="샘플 1"
            render={
              <Textarea
                id="sampleSnippet1"
                name="sampleSnippet1"
                rows={4}
                defaultValue={persona.sampleSnippets[0] ?? ""}
              />
            }
          />
          <Field
            name="sampleSnippet2"
            label="샘플 2 (선택)"
            render={
              <Textarea
                id="sampleSnippet2"
                name="sampleSnippet2"
                rows={4}
                defaultValue={persona.sampleSnippets[1] ?? ""}
              />
            }
          />
        </div>
      </Section>

      {/* ============== QUALITY RULES ============== */}
      <Section
        title="품질 규칙 (anti-detection)"
        desc="AI가 매번 지킬 추가 규칙. 한 줄에 한 가지씩."
      >
        <div className="space-y-2">
          <Label htmlFor="qualityRules">규칙</Label>
          <ChipsInput
            name="qualityRules"
            defaultValue={persona.qualityRules}
            tone="neutral"
            placeholder="예: 가격 정보는 '방문 시 기준' 명시"
          />
          <Hint>
            과장·반복·표준 문구를 피해 자연스러운 글이 되도록 안내합니다.
          </Hint>
        </div>
      </Section>

      {/* ============== SCHEDULE ============== */}
      <Section
        title="자동 생성 스케줄"
        desc="AI가 초안을 자동으로 만드는 요일과 시각을 설정합니다."
      >
        <SchedulePicker name="cron" defaultValue={blog.cron} />
        <Field
          name="jitterMin"
          label="무작위 시간 흔들기"
          render={
            <select
              id="jitterMin"
              name="jitterMin"
              defaultValue={String(blog.jitterMin)}
              className="h-10 w-full rounded-lg border border-paper-300 bg-paper-50 px-3 text-sm focus:border-ink-700 focus:ring-2 focus:ring-ink-700/10 outline-none"
            >
              <option value="0">없음 (정확한 시각에 실행)</option>
              <option value="15">약간 (±15분 사이 랜덤)</option>
              <option value="30">보통 (±30분 사이 랜덤)</option>
              <option value="60">많이 (±1시간 사이 랜덤)</option>
              <option value="120">최대 (±2시간 사이 랜덤)</option>
            </select>
          }
          hint="매번 조금씩 다른 시간에 올라오면 더 자연스러워 보입니다."
        />
      </Section>

      <div className="space-y-2">
        <Field
          name="notes"
          label="기타 메모"
          render={
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={persona.notes}
              placeholder="AI에게 따로 알려주고 싶은 컨텍스트가 있다면…"
            />
          }
        />
      </div>

      <div className="flex gap-2 pt-2 pb-12">
        <Button type="submit" variant="accent" size="lg">
          <Sparkles className="size-4" />
          {mode === "create" ? "블로그 추가" : "변경사항 저장"}
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  desc,
  accent,
  children,
}: {
  title: string;
  desc?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={accent ? "border-accent-200/80 bg-accent-50/30" : undefined}
    >
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-bold text-base text-ink-900">{title}</h3>
          {desc && (
            <p className="text-sm text-ink-500 mt-0.5 leading-relaxed">
              {desc}
            </p>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({
  name,
  label,
  type = "text",
  hint,
  render,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  hint?: string;
  render?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      {render ?? <Input id={name} name={name} type={type} {...rest} />}
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-ink-400 leading-relaxed">
      <Info className="size-3 mt-0.5 shrink-0" />
      {children}
    </p>
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-10 w-full rounded-lg border border-paper-300 bg-paper-50 px-3 text-sm focus:border-ink-700 focus:ring-2 focus:ring-ink-700/10 outline-none"
    />
  );
}

function SegmentChoice({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="grid grid-cols-3 rounded-lg border border-paper-300 p-0.5 bg-paper-200/40">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-11 rounded-md text-xs font-semibold transition touch-manipulation ${
            value === o.value
              ? "bg-paper-50 text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

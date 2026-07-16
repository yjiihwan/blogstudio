"use client";

import { useActionState, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import {
  generateManualDraftActionState,
  type GenerateDraftState,
} from "../../[id]/actions";

export function ManualDraftForm({
  blogId,
  blogName,
  personaName,
}: {
  blogId: string;
  blogName: string;
  personaName: string;
}) {
  const [state, action, pending] = useActionState<GenerateDraftState, FormData>(
    generateManualDraftActionState,
    null
  );
  const [photoMode, setPhotoMode] = useState<"manual" | "auto">("manual");
  const [fileNames, setFileNames] = useState<string[]>([]);
  // 제어 입력 — React 19는 <form action> 제출 후 '비제어' 필드를 자동 리셋한다.
  // 되묻기(needsInfo)는 리다이렉트 없이 상태만 반환하므로, 제어하지 않으면 제목/내용이 지워져
  // 보강 재제출 시 required 검증에 막힌다. useState는 왕복 간 값이 유지된다.
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [keywords, setKeywords] = useState("");
  // "" = 페르소나 기본 화자 유지(하위호환). 지정 시 페르소나 화자를 덮어쓴다.
  const [speaker, setSpeaker] = useState("");

  // 라벨은 각 옵션이 '실제로 누가 말하는지' 드러나게(오해 방지).
  const SPEAKER_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
    { value: "", label: "페르소나 기본값 유지", hint: "블로그 페르소나에 설정된 화자를 그대로 사용" },
    { value: "owner", label: "운영자·직원 (업체 측)", hint: "우리 시설을 소개·안내하는 톤 — “저희 ○○에서는~”, “직접 갖춰 두었어요”" },
    { value: "first_person", label: "고객 후기 (1인칭·방문자)", hint: "직접 다녀온 손님 경험담 — “제가 가보니~”, “다녀왔어요”" },
    { value: "expert", label: "전문가 해설", hint: "근거·정보 중심으로 차분하게 설명" },
    { value: "third_person", label: "3인칭 관찰자", hint: "담담하게 소개·관찰" },
  ];
  const speakerHint = SPEAKER_OPTIONS.find((o) => o.value === speaker)?.hint ?? "";

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="blogId" value={blogId} />

      <div className="rounded-lg bg-paper-200 px-4 py-2.5 text-sm text-ink-600">
        대상 블로그: <strong>{blogName}</strong>
        <span className="text-ink-400"> · 적용 페르소나: {personaName}</span>
      </div>

      {/* 제목/주제 */}
      <div className="space-y-1.5">
        <Label htmlFor="title">제목 / 주제 *</Label>
        <Input
          id="title"
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 6월 신메뉴 출시 이벤트 안내"
        />
      </div>

      {/* 내용 디테일 */}
      <div className="space-y-1.5">
        <Label htmlFor="brief">내용 디테일 *</Label>
        <Textarea
          id="brief"
          name="brief"
          required
          rows={7}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder={
            "글에 꼭 담고 싶은 내용을 자유롭게 적어주세요.\n예) 6/20~30 한정 신메뉴 '직화 불고기 덮밥' 출시. 가격 9,900원, 첫 주 방문 고객 음료 무료. 매장 한정 판매. 매콤달콤한 맛 강조."
          }
        />
        <p className="text-xs text-ink-400">
          여기 적은 내용을 충실히 반영합니다. 말투·길이·금지어 등은 블로그 페르소나 설정을 그대로 따릅니다. (화자는 아래에서 이 글에 한해 바꿀 수 있어요.)
        </p>
      </div>

      {/* 키워드(선택) */}
      <div className="space-y-1.5">
        <Label htmlFor="keywords">키워드 (선택, 쉼표로 구분)</Label>
        <Input
          id="keywords"
          name="keywords"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="예: 신메뉴, 직화 불고기 덮밥, 6월 이벤트"
        />
      </div>

      {/* 화자(누가 쓰는 글인지) */}
      <div className="space-y-1.5">
        <Label htmlFor="speaker">화자 (누구 입장에서 쓰는 글인가요?)</Label>
        <select
          id="speaker"
          name="speaker"
          value={speaker}
          onChange={(e) => setSpeaker(e.target.value)}
          className="flex h-10 w-full rounded-lg border border-paper-300 bg-paper-50 px-3 text-sm text-ink-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
        >
          {SPEAKER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-ink-400">
          {speaker === ""
            ? "지정하면 이 글에 한해 페르소나 기본 화자를 덮어씁니다. "
            : ""}
          {speakerHint}
        </p>
      </div>

      {/* 사진 처리 방식 */}
      <div className="space-y-2">
        <Label>사진</Label>
        <input type="hidden" name="photoMode" value={photoMode} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPhotoMode("manual")}
            className={`rounded-lg border px-4 py-3 text-left text-sm transition ${
              photoMode === "manual"
                ? "border-accent-500 bg-accent-50 ring-1 ring-accent-500/30"
                : "border-paper-300 bg-paper-50 hover:bg-paper-100"
            }`}
          >
            <div className="font-semibold">직접 첨부</div>
            <div className="text-xs text-ink-500 mt-0.5">
              가진 사진을 지금 올리면 본문에 자동 배치
            </div>
          </button>
          <button
            type="button"
            onClick={() => setPhotoMode("auto")}
            className={`rounded-lg border px-4 py-3 text-left text-sm transition ${
              photoMode === "auto"
                ? "border-accent-500 bg-accent-50 ring-1 ring-accent-500/30"
                : "border-paper-300 bg-paper-50 hover:bg-paper-100"
            }`}
          >
            <div className="font-semibold">AI에 맡기기 (기존 방식)</div>
            <div className="text-xs text-ink-500 mt-0.5">
              AI가 이미지 계획 → [사진 요청]에서 업로드
            </div>
          </button>
        </div>

        {photoMode === "manual" && (
          <div className="mt-2 rounded-lg border border-dashed border-paper-300 bg-paper-50 px-4 py-4">
            <input
              id="photos"
              name="photos"
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
              multiple
              onChange={(e) =>
                setFileNames(Array.from(e.target.files ?? []).map((f) => f.name))
              }
              className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-800 file:px-3 file:py-1.5 file:text-paper-100 file:text-sm file:font-semibold hover:file:bg-ink-900"
            />
            {fileNames.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-ink-600">
                  각 사진에 <strong>짧은 설명</strong>을 달아주세요 — 본문의 맞는 문단에 그 사진을 배치합니다. (예: 프리웨이트존 / 러닝머신 구역 / 매장 외관)
                </p>
                {fileNames.map((n, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 truncate text-[11px] text-ink-400" title={n}>
                      {i + 1}. {n}
                    </span>
                    <Input
                      name="photoLabel"
                      placeholder="이 사진 설명 (예: 프리웨이트존)"
                      className="text-sm"
                    />
                  </div>
                ))}
                <p className="text-[11px] text-ink-400">
                  설명을 비워두면 올린 순서대로 배치됩니다. JPG·PNG·HEIC·WebP, 장당 최대 10MB.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink-400">
                JPG·PNG·HEIC·WebP, 장당 최대 10MB. 사진마다 설명을 달면 본문 맞는 위치에 배치됩니다. (없이 생성도 가능)
              </p>
            )}
            <p className="mt-1 text-[11px] text-ink-400">
              ※ 사진은 <strong>원본 그대로</strong> 올라갑니다(화질·EXIF 유지). 합쳐서 <strong>최대 100MB</strong>까지 가능하며, 초과 시 사진 수를 줄여주세요.
            </p>
          </div>
        )}
      </div>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      {/* 대화형 보강 루프 — 정보 부족 시 되묻기. 누적 정보를 hidden으로 되돌리고 추가 입력을 받는다. */}
      {state && "needsInfo" in state && (
        <div className="rounded-lg border border-accent-300 bg-accent-50 p-4">
          <input type="hidden" name="supplements" value={JSON.stringify(state.supplements)} />
          <p className="whitespace-pre-wrap text-sm text-ink-700">{state.request}</p>
          <Textarea
            name="supplement"
            rows={5}
            placeholder="추가 정보를 자유롭게 적어주세요. 이전에 주신 내용까지 모두 합쳐 다시 씁니다. (더 줄 정보가 없으면 빈칸으로 다시 생성 → 있는 정보만으로 최선을 다합니다)"
            className="mt-3"
          />
          <p className="mt-1.5 text-xs text-ink-500">
            지금까지 받은 보강 정보 {state.supplements.length}건이 누적되어 있습니다.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="accent" size="lg" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {pending ? "생성 중..." : "초안 생성"}
        </Button>
        {pending && <span className="text-xs text-ink-500">약 15~40초 소요</span>}
      </div>
    </form>
  );
}

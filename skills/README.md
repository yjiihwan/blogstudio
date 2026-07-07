# 글쓰기 스킬 (Writing Skills) — 명세서 색인

블로그 스튜디오 초안을 "사람이 직접 쓴 글"에 가깝게 다듬는 재작성 스킬 5종의 명세서다.
**이 문서는 명세(spec)이며, 아직 엔진 코드에 배선되지 않았다.** 각 스킬을 코드로 옮길 때 필요한
입출력 시그니처와 규칙을 정의해, 다음 단계(엔진 배선)의 설계도 역할을 한다.

관련 상위 규칙: `src/lib/global-guide.ts`의 `DEFAULT_GLOBAL_GUIDE`(전역 AI-티 금지 규칙)와
`src/lib/pipeline.ts`의 `humanizeBody` 패스가 이미 존재한다. 아래 스킬들은 그 규칙을
**단계별·독립 패스**로 분해·확장한 것이다.

## 스킬 목록

| # | 스킬 | 한 줄 정의 | 파일 |
|---|---|---|---|
| 1 | **anti-ai** | 'AI 티' 패턴 6카테고리(35+항목)를 3모드·2차패스·P0/P1/P2로 걷어낸다 | [anti-ai.md](./anti-ai.md) |
| 2 | **storytelling** | '그런데/그래서'로 문단을 잇는 서사 구조를 부여한다 | [storytelling.md](./storytelling.md) |
| 3 | **voice-dna** | 톤 DNA를 구조화 프로필(JSON)로 적용한다(사용자 톤 우선, 없으면 페르소나 자동추정) | [voice-dna.md](./voice-dna.md) |
| 4 | **viral-hooks** | 훅 유형별 다수 후보를 생성·선택해 첫 문장을 강화한다 | [viral-hooks.md](./viral-hooks.md) |
| 5 | **dumbify** | 어려운 문장을 중학생도 이해할 쉬운 말로 재작성한다 | [dumbify.md](./dumbify.md) |

## 공개 스킬팩 대비 보강 (2026-07-07)

실존 공개 스킬(`conorbronsdon/avoid-ai-writing`, `az9713/ai-co-writing-claude-skills`)과 대조해 보강했다.
전량 **영어 관용구 번역이 아니라 한글 블로그용 재설계**다.

- **anti-ai**: 패턴을 6카테고리 35+항목으로 확충 + **한글판 표현 교체 테이블(Tier 1/2/3)** + **detect/
  rewrite/edit 3모드** + **2단계 감지(1차→2차 자가감사)** + **P0/P1/P2 심각도** + 출력 4섹션.
- **voice-dna**: 기존 분기 유지 + **구조화 Voice DNA 프로필(JSON: 톤·문장·어휘·오프닝/클로징·
  never-use·채널변형)** + 페르소나 자동추정 **추출 명세**(무엇을 어느 필드에서 뽑는지).
- **viral-hooks**: 단일 교체 → **훅 유형별 3~5개 후보 생성·선택**(장면/문제/데이터/역설/도발/스토리).
- **storytelling·dumbify**: 공개팩 대응물 약함 = **우리 차별점**. 유지하되 anti-ai '리듬 다양화(C-15)'와의
  **정합 섹션** 신설(문장 길이 균일 회피 ↔ 서사 접속사 절제).

## 확장된 생성 파이프라인 (권장 순서)

```
초안 생성 ─▶ storytelling ─▶ anti-ai ─▶ voice-dna ─▶ viral-hooks ─▶ dumbify ─▶ 채점(SEO/휴먼톤) ─▶ 검수
             (서사 구조)     (rewrite·2차패스) (프로필 확정)  (후보 N개→선택)  (가독성)
```

- 자동 파이프라인에서 **anti-ai는 rewrite 모드**(감지→재작성→2차 자가감사)로 돈다. 반자동 검수 화면의
  "AI티 스캔"은 **detect 모드**(P0/P1/P2 플래그만)로 호출한다.
- voice-dna는 본문을 물들이기 전에 **Voice DNA 프로필(JSON)을 먼저 확정**하고, 그 프로필의 `never_use`가
  anti-ai 카탈로그와 연동돼 뒤 단계의 재유입을 막는다.
- dumbify(맨 끝)는 anti-ai 리듬 변주·voice-dna 어미 믹스를 **보존**한다(각 문서 §anti-ai 정합).

### 순서 근거 (dev 판단)

운영 요청의 예시 순서(anti-ai → voice-dna → storytelling → viral-hooks → dumbify)를 검토한 결과,
**storytelling을 anti-ai 앞으로** 옮기는 것이 안전하다. 근거:

1. **storytelling(구조) 먼저** — 문단 재배치·서사 연결은 글의 뼈대를 바꾸는 가장 큰 구조 변경이다.
   폴리싱(톤·훅·쉬운말) 이전에 구조를 먼저 확정해야 뒤 단계가 헛일이 되지 않는다.
2. **anti-ai를 storytelling 바로 뒤로** — storytelling은 '그런데/그래서' 같은 **의도된 서사 접속사**를
   일부러 넣는다. anti-ai는 '접속사 남발'을 잡는다. 둘을 반대 순서로 두면 anti-ai가 정리한 뒤
   storytelling이 접속사를 다시 늘려 남발이 재발한다. **storytelling → anti-ai** 순서면 anti-ai가
   서사 연결의 '의도된 접속사'는 보존하면서 기계적 남발만 정리해 충돌이 해소된다.
3. **voice-dna(톤)는 구조 확정 후** — 톤은 최종 어휘·어미를 물들이는 표면 작업이라, 구조가 고정된
   뒤 적용해야 일관된다.
4. **viral-hooks(도입부)는 톤 확정 후** — 훅이 최종 목소리와 어울리고, 확립된 서사로 자연스럽게
   이어져야 하므로 톤 다음.
5. **dumbify(쉬운말)는 맨 마지막** — 가독성 단순화는 뒤 단계가 되돌릴 수 없는 최종 상태에서 해야
   하고, 거의 완성된 텍스트에 적용되어야 안전하다.

> 각 스킬의 do/don't는 서로를 존중한다. 특히 storytelling·voice-dna·viral-hooks는 anti-ai 규칙을
> 위반하는 표현을 새로 만들지 않는다(각 문서 don't에 명시).

## 공통 입출력 시그니처 (엔진 배선용)

모든 스킬은 **초안(+옵션)을 받아 수정본을 돌려주는** 동일한 순수-변환 형태로 배선한다.

```ts
type SkillInput = {
  draftMd: string;              // 대상 초안(마크다운). 이미지 마커/소제목 보존 필수
  persona: PersonaInput;        // src/lib/llm/prompts.ts 의 PersonaInput
  options?: SkillOptions;       // 스킬별 옵션(아래 각 문서 참조)
};

type SkillResult = {
  revisedMd: string;            // 수정본(마크다운). 실패/변경불가 시 draftMd 원본 그대로
  changes: { before: string; after: string; reason: string }[]; // 감사 로그
  notes?: string[];             // 검수 화면 노출용 경고/메모(예: seoIssues 스타일)
};
```

**불변식(모든 스킬 공통):**
- 이미지 마커(`![...](...)`)·소제목(H2/H3)·상호·URL·확정 수치를 삭제·조작하지 않는다.
- 없는 사실을 새로 지어내지 않는다(전역 가이드 0번 규칙 최우선).
- 결과가 비정상(길이 급감·마커 유실)이면 원본을 유지하고 `notes`에 사유를 남긴다.

각 스킬 문서 구조는 **트리거 / 규칙(do·don't) / 적용 전후 예시 / 통과 체크리스트 / 입출력**으로 통일한다.

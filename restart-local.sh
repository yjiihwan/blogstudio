#!/bin/bash
# 블로그 스튜디오 테일스케일 로컬(3001) 재시작 스크립트
# 사용법:  ~/blog_studio/restart-local.sh
set -e
cd "$(dirname "$0")"

echo "[1/3] 기존 3001 서버 종료..."
lsof -ti:3001 | xargs kill 2>/dev/null || echo "  (떠있던 서버 없음)"
sleep 1

echo "[2/3] 빌드 중... (1~2분)"
npm run build

echo "[3/3] 서버 재기동 (백그라운드, 포트 3001)..."
# next start 는 기본 3000 → 테일스케일 프록시 대상인 127.0.0.1:3001 로 명시 바인딩해야 함
nohup npx next start -p 3001 -H 127.0.0.1 > /tmp/blogstudio.log 2>&1 &
sleep 4

if lsof -ti:3001 >/dev/null 2>&1; then
  echo "✅ 완료! https://ide-macmini.taila25bd1.ts.net:3001 접속 가능"
else
  echo "⚠️ 기동 실패 — 로그 확인: tail -f /tmp/blogstudio.log"
fi

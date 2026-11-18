// 장비 매뉴얼 AI 질의응답 — Supabase Edge Function
// 웹앱 → (이 함수: 키 보관·횟수 제한) → 사내 AI 게이트웨이(Anthropic Messages API 경로) → Claude
//
// 두 가지 방식:
//   1) 페이지 질문   : { question, images:[{page,data}] }  → { answer }
//   2) 문서 전체 탐색: { mode:"doc", messages:[...] }       → { stop_reason, content }
//      AI가 view_pages 도구로 페이지를 요청하면, 웹앱이 그 페이지를 그려서 다음 요청에 실어 보낸다.
//
// 필요한 비밀값(Supabase 대시보드 → Edge Functions → Secrets):
//   AI_GATEWAY_KEY   (필수) 사내 게이트웨이 API 키
//   AI_PASSCODE      (권장) AI 기능 전용 비밀번호. 설정하면 이 값을 아는 사람만 사용
//   AI_DAILY_LIMIT   (선택) 하루 최대 호출 수. 기본 300 (문서 전체 질문 1건은 여러 번 호출함)
//   AI_MODEL         (선택) 기본 claude-sonnet-5-5
//   AI_GATEWAY_BASE  (선택) 기본 https://api.baze.co/v1/gateway/claude
//   AI_ALLOWED_ORIGINS (선택) 쉼표로 구분한 허용 출처
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const API_KEY = Deno.env.get("AI_GATEWAY_KEY") ?? "";
const PASSCODE = Deno.env.get("AI_PASSCODE") ?? "";
const DAILY_LIMIT = parseInt(Deno.env.get("AI_DAILY_LIMIT") ?? "300", 10) || 300;
const MODEL = Deno.env.get("AI_MODEL") ?? "claude-sonnet-5-5";
const GATEWAY_BASE = Deno.env.get("AI_GATEWAY_BASE") ?? "https://api.baze.co/v1/gateway/claude";
// 사내 AI "기관 지식 챗봇"(매뉴얼 RAG) — OpenAI 호환 엔드포인트
const CHATBOT_ID = Deno.env.get("AI_CHATBOT_ID") ?? "57288";
const CHATBOT_BASE = Deno.env.get("AI_CHATBOT_BASE") ?? "https://api.baze.co/v1/gateway/chatbots";
const ALLOWED_ORIGINS = (Deno.env.get("AI_ALLOWED_ORIGINS") ??
  "https://my-website-two-blond-40.vercel.app,http://localhost:8777,http://localhost:3000")
  .split(",").map((s) => s.trim()).filter(Boolean);

const MAX_IMAGES = 4;              // 페이지 질문: 한 번에 보낼 수 있는 페이지 수
const MAX_IMAGE_B64 = 2_000_000;   // 이미지 1장 base64 길이 상한(약 1.5MB)
const MAX_QUESTION = 2000;
const DOC_MAX_MESSAGES = 16;       // 문서 탐색: 대화 길이 상한
const DOC_MAX_IMAGES = 20;         // 문서 탐색: 한 질문에서 열어볼 수 있는 총 페이지 수

const COMMON_RULES = [
  "보낸 페이지에 실제로 있는 내용만 근거로 한국어로 답하세요. 현장에서 정비 판단에 쓰이므로, 페이지에 없는 수치나 절차를 추측해서 채우면 안 됩니다.",
  "답의 근거가 된 페이지는 (p.N) 형식으로 표시하세요. 부품번호, 단자명, 수치와 단위, 도면번호는 원문 표기 그대로 적으세요.",
  "회로도·블록도·표를 설명할 때는 신호나 전원의 흐름 순서대로 풀어 쓰고, 페이지에 안전 경고(고전압, 고주파 등)가 있으면 함께 알려주세요.",
  "글자가 흐리거나 잘려서 확실히 읽을 수 없는 부분은 읽을 수 없다고 밝히세요.",
];

const SYSTEM = [
  "당신은 방송 송신설비 장비 매뉴얼을 읽고 설명하는 정비 보조 AI입니다.",
  "사용자는 송·중계소 현장의 방송 기술 엔지니어이고, 매뉴얼 페이지를 이미지로 보내며 질문합니다. 각 이미지 앞에는 [p.N] 형식으로 페이지 번호가 붙어 있습니다.",
  ...COMMON_RULES,
  "페이지에서 답을 찾을 수 없으면 '보낸 페이지에는 그 내용이 없습니다'라고 말하고, 어떤 섹션이나 도면을 보면 좋을지 페이지에 단서가 있으면 알려주세요.",
].join("\n");

const DOC_SYSTEM = [
  "당신은 방송 송신설비 장비 매뉴얼에서 필요한 내용을 찾아 설명하는 정비 보조 AI입니다.",
  "사용자는 송·중계소 현장의 방송 기술 엔지니어입니다. 매뉴얼은 수백 쪽짜리 PDF이고 본문 대부분이 스캔 이미지라서, 처음에는 북마크(섹션 시작 페이지)와 글자가 추출된 일부 페이지(목차 등)의 텍스트만 주어집니다.",
  "view_pages 도구로 PDF 페이지를 이미지로 열어볼 수 있습니다. 질문에 답하려면 먼저 관련 있을 페이지를 열어서 직접 읽으세요. 목차만 보고 본문 내용을 짐작해서 답하지 마세요.",
  "페이지를 고르는 요령: 북마크는 섹션이 시작하는 실제 PDF 페이지를 알려줍니다. 목차에 '3-7'처럼 '섹션-쪽' 표기가 있으면 그 섹션 시작 페이지에 쪽수를 더해 실제 페이지를 추정할 수 있습니다. 추정이 빗나가면 열어본 페이지의 쪽 번호나 제목을 단서로 앞뒤 페이지를 다시 요청하세요. 도면·부품표는 보통 해당 유닛 섹션 안에 순서대로 이어집니다.",
  "열어볼 수 있는 페이지 수에는 한도가 있으니, 한 번에 가장 가능성 높은 페이지 2~5장을 요청하고 범위를 좁혀 가세요. 한도를 다 썼다는 안내를 받으면 더 요청하지 말고 지금까지 본 내용으로 답하세요.",
  ...COMMON_RULES,
  "끝내 찾지 못했으면 찾지 못했다고 밝히고, 어디까지 확인했는지와 사용자가 직접 넘겨볼 만한 페이지 범위를 알려주세요.",
].join("\n");

// 홈 "AI 검색" 요약용 — 정비사례·일일업무일지·장비 매뉴얼 검색 결과만 근거로 답한다
const SEARCH_SYSTEM = [
  "당신은 방송 송신설비의 정비사례·일일업무일지·장비 매뉴얼을 분석하는 정비 지식 검색 AI입니다.",
  "반드시 아래에 제공된 검색 결과(정비사례/일일업무일지/장비 매뉴얼)에 있는 내용만 근거로 답하세요.",
  "검색 결과에 없는 고장 원인이나 조치방법을 추측하거나 지어내지 마세요. 정보가 없으면 '등록된 정보가 없습니다'라고 하세요.",
  "같은 시설·장비·날짜가 정비사례와 일지에 함께 나오면 하나의 정비 이력으로 연결해 설명하세요.",
  "한국어로 간결하게 답하고, 근거가 된 날짜·시설·장비를 함께 표시하세요. 먼저 핵심 요약을 쓰고, 이어서 주요 내용을 정리하세요.",
].join("\n");

const VIEW_PAGES_TOOL: Anthropic.Tool = {
  name: "view_pages",
  description:
    "매뉴얼 PDF의 지정한 페이지들을 이미지로 가져옵니다. 본문을 읽어야 답할 수 있는 질문에서, 답하기 전에 사용하세요. 페이지 번호는 PDF의 실제 페이지 번호(1부터 전체 페이지 수까지)입니다. 한 번에 최대 5장.",
  input_schema: {
    type: "object",
    properties: {
      pages: {
        type: "array",
        items: { type: "integer" },
        description: "열어볼 PDF 페이지 번호 목록. 예: [46, 47, 48]",
      },
    },
    required: ["pages"],
  },
};

// 게이트웨이는 경로 끝에 '/'를 요구하고 Bearer 인증을 쓰므로, SDK 요청을 그에 맞춰 보낸다.
const anthropic = new Anthropic({
  apiKey: API_KEY,
  baseURL: GATEWAY_BASE,
  maxRetries: 1,
  timeout: 120_000,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (!u.pathname.endsWith("/")) u.pathname += "/";
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${API_KEY}`);
    return fetch(u, { ...init, headers });
  },
});

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

// 문서 탐색 대화에 들어 있는 이미지 수를 세고 크기를 검사한다
function countImages(messages: unknown[]): number {
  let n = 0;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.type === "image") {
        const data = (o.source as Record<string, unknown> | undefined)?.data;
        if (typeof data !== "string" || data.length > MAX_IMAGE_B64) throw new Error("이미지가 너무 크거나 형식이 잘못됐어요.");
        n++;
        return;
      }
      Object.values(o).forEach(walk);
    }
  };
  walk(messages);
  return n;
}

function apiErrorResponse(error: unknown, origin: string | null) {
  if (error instanceof Anthropic.AuthenticationError) {
    return json({ error: "게이트웨이 API 키가 올바르지 않아요. AI_GATEWAY_KEY 비밀값을 확인하세요." }, 502, origin);
  } else if (error instanceof Anthropic.PermissionDeniedError) {
    return json({ error: "이 키로는 해당 모델을 쓸 수 없어요: " + error.message }, 502, origin);
  } else if (error instanceof Anthropic.RateLimitError) {
    return json({ error: "AI 서버가 바빠요. 잠시 후 다시 시도하세요." }, 429, origin);
  } else if (error instanceof Anthropic.APIError) {
    return json({ error: `AI 서버 오류(${error.status ?? "연결"}): ${error.message}` }, 502, origin);
  }
  return json({ error: "AI 호출 실패: " + (error instanceof Error ? error.message : String(error)) }, 502, origin);
}

// 사내 "기관 지식 챗봇"(매뉴얼 RAG) 호출 — OpenAI 호환. 경로 끝 '/' 유무를 둘 다 시도한다.
const CHATBOT_SYSTEM = [
  "사용자는 방송 송·중계소 현장의 방송 기술 엔지니어입니다.",
  "업로드된 장비 매뉴얼(지식)에서 찾은 내용만 근거로 한국어로 답하세요. 매뉴얼에 없는 수치·절차를 추측해 채우지 마세요.",
  "부품번호·단자명·수치와 단위·도면번호는 원문 표기 그대로 적고, 가능하면 어느 매뉴얼/섹션에서 나온 내용인지 함께 밝히세요.",
  "지식에서 찾을 수 없으면 '등록된 매뉴얼에서 해당 내용을 찾지 못했습니다'라고 말하세요.",
].join("\n");

async function callChatbot(question: string, history: { role: string; content: string }[]) {
  const msgs = [
    { role: "system", content: CHATBOT_SYSTEM },
    ...history.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];
  const payload = JSON.stringify({ messages: msgs, stream: false });
  const paths = [
    `${CHATBOT_BASE}/${CHATBOT_ID}/chat/completions`,
    `${CHATBOT_BASE}/${CHATBOT_ID}/chat/completions/`,
  ];
  let lastRes: Response | null = null;
  for (const url of paths) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: payload,
    });
    // 경로 끝 '/' 문제(404/405/리다이렉트)면 다음 형태로 재시도
    if ([301, 302, 307, 308, 404, 405].includes(res.status)) { lastRes = res; continue; }
    return res;
  }
  return lastRes!;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "POST만 지원합니다." }, 405, origin);
  if (!API_KEY) return json({ error: "서버에 AI_GATEWAY_KEY 비밀값이 설정되지 않았어요." }, 500, origin);

  let body: {
    mode?: string; question?: string; context?: string; passcode?: string; title?: string; maker?: string; model?: string;
    images?: { page: number; data: string }[];
    messages?: Anthropic.MessageParam[];
    history?: { role: string; content: string }[];
  };
  try { body = await req.json(); } catch { return json({ error: "요청 형식이 잘못됐어요." }, 400, origin); }

  // 1) AI 전용 비밀번호(설정된 경우)
  if (PASSCODE && body.passcode !== PASSCODE) {
    return json({ code: "passcode", error: "AI 기능 비밀번호가 필요해요." }, 401, origin);
  }

  // 2) 입력 검증
  const isDoc = body.mode === "doc";
  const isChat = body.mode === "chat";
  const isChatbot = body.mode === "chatbot";
  const question = (body.question ?? "").trim();
  const context = (body.context ?? "").toString();
  const images = Array.isArray(body.images) ? body.images : [];
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (isChat || isChatbot) {
    if (!question) return json({ error: "질문을 입력하세요." }, 400, origin);
    if (question.length > MAX_QUESTION) return json({ error: `질문은 ${MAX_QUESTION}자 이내로 써주세요.` }, 400, origin);
  } else if (isDoc) {
    if (!messages.length || messages[0]?.role !== "user") return json({ error: "대화 형식이 잘못됐어요." }, 400, origin);
    if (messages.length > DOC_MAX_MESSAGES) return json({ error: "탐색 단계가 너무 많아요. 질문을 좁혀서 다시 해보세요." }, 400, origin);
    try {
      if (countImages(messages) > DOC_MAX_IMAGES) return json({ error: `한 질문에서 열어볼 수 있는 페이지는 ${DOC_MAX_IMAGES}장까지예요.` }, 400, origin);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400, origin);
    }
  } else {
    if (!question) return json({ error: "질문을 입력하세요." }, 400, origin);
    if (question.length > MAX_QUESTION) return json({ error: `질문은 ${MAX_QUESTION}자 이내로 써주세요.` }, 400, origin);
    if (!images.length) return json({ error: "보낼 매뉴얼 페이지가 없어요." }, 400, origin);
    if (images.length > MAX_IMAGES) return json({ error: `페이지는 한 번에 ${MAX_IMAGES}장까지 보낼 수 있어요.` }, 400, origin);
    for (const im of images) {
      if (typeof im?.data !== "string" || !im.data || im.data.length > MAX_IMAGE_B64 || !Number.isFinite(im.page)) {
        return json({ error: "페이지 이미지가 너무 크거나 형식이 잘못됐어요." }, 400, origin);
      }
    }
  }

  // 3) 하루 호출 수 제한 (ai_usage.sql 로 만든 함수 사용)
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: ok, error } = await admin.rpc("ai_usage_hit", { max_per_day: DAILY_LIMIT });
    if (error) return json({ error: "사용량 기록 테이블이 없어요. ai_usage.sql 을 먼저 실행하세요. (" + error.message + ")" }, 500, origin);
    if (!ok) return json({ code: "limit", error: `오늘 AI 사용 한도(${DAILY_LIMIT}회)를 다 썼어요. 내일 다시 시도하세요.` }, 429, origin);
  } catch (e) {
    return json({ error: "사용량 확인 실패: " + (e instanceof Error ? e.message : String(e)) }, 500, origin);
  }

  // 4-C) 사내 기관 지식 챗봇(매뉴얼 RAG)에 직접 질문 — 챗봇이 자기 지식에서 찾아 답한다
  if (isChatbot) {
    try {
      const res = await callChatbot(question, Array.isArray(body.history) ? body.history : []);
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try { const j = JSON.parse(text); msg = j.error?.message || j.error || j.message || text; } catch { /* 원문 사용 */ }
        if (res.status === 401 || res.status === 403) {
          return json({ error: "챗봇 API 키/권한 오류예요. AI_GATEWAY_KEY와 챗봇의 'API 접근 허용'을 확인하세요." }, 502, origin);
        }
        return json({ error: `챗봇 서버 오류(${res.status}): ${String(msg).slice(0, 300)}` }, 502, origin);
      }
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(text); } catch { return json({ error: "챗봇 응답을 해석할 수 없어요: " + text.slice(0, 200) }, 502, origin); }
      const choices = (data.choices as Array<Record<string, unknown>> | undefined) ?? [];
      const message = (choices[0]?.message as Record<string, unknown> | undefined) ?? {};
      const answer = (typeof message.content === "string" ? message.content : "").trim();
      if (!answer) return json({ error: "챗봇이 빈 답을 보냈어요." }, 502, origin);
      return json({ answer, model: data.model ?? `chatbot:${CHATBOT_ID}`, usage: data.usage }, 200, origin);
    } catch (e) {
      return json({ error: "챗봇 호출 실패: " + (e instanceof Error ? e.message : String(e)) }, 502, origin);
    }
  }

  // 4-0) 홈 AI 검색 요약: 검색 결과(context)만 근거로 한 번에 답한다
  if (isChat) {
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "low" },
        system: SEARCH_SYSTEM,
        messages: [{ role: "user", content: `질문: ${question}\n\n[검색된 실제 기록 — 이 내용만 근거로 답하세요]\n${context.slice(0, 40000) || "(검색 결과 없음)"}` }],
      });
      if (response.stop_reason === "refusal") {
        return json({ error: "AI가 이 요청에는 답하지 않았어요." }, 200, origin);
      }
      let answer = "";
      for (const block of response.content) if (block.type === "text") answer += block.text;
      return json({ answer: answer.trim(), model: response.model, usage: response.usage }, 200, origin);
    } catch (error) {
      return apiErrorResponse(error, origin);
    }
  }

  // 4-A) 문서 전체 탐색: 대화를 그대로 전달하고, 응답(도구 요청 포함)을 웹앱에 돌려준다
  if (isDoc) {
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        system: DOC_SYSTEM,
        tools: [VIEW_PAGES_TOOL],
        messages,
      });
      if (response.stop_reason === "refusal") {
        return json({ error: "AI가 이 요청에는 답하지 않았어요. 질문을 바꿔서 다시 시도해 보세요." }, 200, origin);
      }
      return json({ stop_reason: response.stop_reason, content: response.content, usage: response.usage }, 200, origin);
    } catch (error) {
      return apiErrorResponse(error, origin);
    }
  }

  // 4-B) 페이지 질문 — 페이지 이미지(앞에 [p.N] 라벨) + 질문
  const meta = [body.title, body.maker, body.model].filter(Boolean).join(" / ");
  const content: Anthropic.ContentBlockParam[] = [];
  for (const im of images) {
    content.push({ type: "text", text: `[p.${im.page}]` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: im.data } });
  }
  content.push({ type: "text", text: (meta ? `매뉴얼: ${meta}\n\n` : "") + `질문: ${question}` });

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "AI가 이 요청에는 답하지 않았어요. 질문을 바꿔서 다시 시도해 보세요." }, 200, origin);
    }
    let answer = "";
    for (const block of response.content) if (block.type === "text") answer += block.text;
    if (response.stop_reason === "max_tokens") answer += "\n\n(답변이 길어 중간에 잘렸어요. 질문을 좁혀서 다시 물어보세요.)";
    return json({ answer: answer.trim(), model: response.model, usage: response.usage }, 200, origin);
  } catch (error) {
    return apiErrorResponse(error, origin);
  }
});

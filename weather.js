// 소속국(지역) → 현재 날씨 자동 조회 (Open-Meteo, 무료·키 불필요)
// ※ KBS 업무 내용은 전송하지 않고, 지역 좌표만 보내 날씨만 받아옵니다.

// 국 → 대표 도시 좌표 [위도, 경도]
const OFFICE_COORDS = {
  "본사": [37.5665, 126.9780], // 서울
  "부산": [35.1796, 129.0756],
  "울산": [35.5384, 129.3114],
  "창원": [35.2280, 128.6811],
  "진주": [35.1800, 128.1076],
  "대구": [35.8714, 128.6014],
  "안동": [36.5684, 128.7294],
  "포항": [36.0190, 129.3435],
  "광주": [35.1595, 126.8526],
  "목포": [34.8118, 126.3922],
  "순천": [34.9506, 127.4872],
  "전주": [35.8242, 127.1480],
  "대전": [36.3504, 127.3845],
  "청주": [36.6424, 127.4890],
  "충주": [36.9910, 127.9259],
  "춘천": [37.8813, 127.7300],
  "강릉": [37.7519, 128.8761],
  "원주": [37.3422, 127.9202],
  "제주": [33.4996, 126.5312],
};

// WMO weather code → 한글
function wmoKorean(code) {
  if (code == null) return "";
  if (code === 0) return "맑음";
  if (code === 1 || code === 2) return "구름조금";
  if (code === 3) return "흐림";
  if (code === 45 || code === 48) return "안개";
  if (code >= 51 && code <= 57) return "이슬비";
  if (code >= 61 && code <= 65) return "비";
  if (code === 66 || code === 67) return "진눈깨비";
  if (code >= 71 && code <= 77) return "눈";
  if (code >= 80 && code <= 82) return "소나기";
  if (code === 85 || code === 86) return "소낙눈";
  if (code >= 95) return "뇌우";
  return "";
}

// 국의 현재 날씨(한글). 실패하면 "" 반환.
export async function fetchWeather(office) {
  const c = OFFICE_COORDS[office];
  if (!c) return "";
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c[0]}&longitude=${c[1]}&current=weather_code&timezone=Asia%2FSeoul`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("weather " + r.status);
  const d = await r.json();
  return wmoKorean(d && d.current && d.current.weather_code);
}

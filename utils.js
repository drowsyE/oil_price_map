// ============================================================
//  유틸리티 함수 모음
// ============================================================

// EPSG:5171 (KATEC, TM128) - commonly used by Korean maps
if (typeof proj4 !== "undefined") {
  proj4.defs("KATEC", "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43");
}

/**
 * WGS84 (위/경도) → KATEC 좌표 변환
 * 오피넷 API는 KATEC 좌표계를 사용합니다
 */
function wgs84ToKatec(lat, lng) {
  if (typeof proj4 !== "undefined") {
    const [x, y] = proj4("WGS84", "KATEC", [lng, lat]);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }
  return { x: 314681.8, y: 544837 }; // fallback
}

/**
 * KATEC 좌표계 → WGS84 (위/경도) 변환
 */
function katecToWgs84(x, y) {
  if (typeof proj4 !== "undefined") {
    const [lng, lat] = proj4("KATEC", "WGS84", [x, y]);
    return { lat, lng };
  }
  return { lat: 37.5013, lng: 127.0396 }; // fallback
}

/**
 * 가격을 원화 포맷으로 표시
 */
function formatPrice(price) {
  if (!price || price === 0) return "-";
  return Number(price).toLocaleString("ko-KR") + "원";
}

/**
 * 가격에 따른 색상 반환 (초록 = 저렴, 노랑 = 보통, 빨강 = 비쌈)
 */
function getPriceColor(price, minPrice, maxPrice) {
  if (!price || price === 0) return "#888888";
  const range = maxPrice - minPrice;
  if (range === 0) return "#4CAF50";
  const ratio = (price - minPrice) / range;
  if (ratio < 0.33) return "#4CAF50"; // 초록
  if (ratio < 0.66) return "#FFC107"; // 노랑
  return "#F44336"; // 빨강
}

/**
 * 가격 등급 레이블 반환
 */
function getPriceLabel(price, minPrice, maxPrice) {
  if (!price || price === 0) return "정보없음";
  const range = maxPrice - minPrice;
  if (range === 0) return "보통";
  const ratio = (price - minPrice) / range;
  if (ratio < 0.33) return "저렴";
  if (ratio < 0.66) return "보통";
  return "비쌈";
}

/**
 * 거리(미터)를 사람이 읽기 쉬운 형태로
 */
function formatDistance(meters) {
  if (meters < 1000) return Math.round(meters) + "m";
  return (meters / 1000).toFixed(1) + "km";
}

/**
 * 현재 시간대 기반 혼잡도 추정 (0~100)
 * 주유소 특성상 출퇴근 시간에 혼잡
 */
function estimateCrowding() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=일, 6=토

  // 주말
  if (day === 0 || day === 6) {
    if (hour >= 10 && hour < 13) return { level: 75, label: "혼잡" };
    if (hour >= 13 && hour < 17) return { level: 60, label: "보통" };
    if (hour >= 17 && hour < 20) return { level: 80, label: "매우 혼잡" };
    if (hour >= 6 && hour < 10) return { level: 30, label: "여유" };
    return { level: 15, label: "한산" };
  }

  // 평일
  if (hour >= 7 && hour < 9) return { level: 85, label: "매우 혼잡" }; // 출근
  if (hour >= 9 && hour < 12) return { level: 40, label: "여유" };
  if (hour >= 12 && hour < 14) return { level: 55, label: "보통" };
  if (hour >= 14 && hour < 17) return { level: 35, label: "여유" };
  if (hour >= 17 && hour < 20) return { level: 90, label: "매우 혼잡" }; // 퇴근
  if (hour >= 20 && hour < 22) return { level: 45, label: "보통" };
  if (hour >= 6 && hour < 7) return { level: 20, label: "한산" };
  return { level: 10, label: "한산" };
}

/**
 * 혼잡도 레벨에 따른 색상
 */
function getCrowdingColor(level) {
  if (level < 30) return "#4CAF50";
  if (level < 60) return "#FFC107";
  if (level < 80) return "#FF9800";
  return "#F44336";
}

/**
 * 하버사인 공식으로 두 좌표 간 거리(미터) 계산
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================
//  메인 애플리케이션 로직
// ============================================================

let map = null;
let markers = [];
let infoWindows = [];
let userMarker = null;
let userLat = 37.5013; // 기본: 강남
let userLng = 127.0396;
let currentFuel = CONFIG.DEFAULT_FUEL;
let currentRadius = CONFIG.DEFAULT_RADIUS;
let currentStations = [];
let selectedStation = null;
let isLoading = false;

// ---------- 지도 초기화 (Google Maps 콜백) ----------
function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: userLat, lng: userLng },
    zoom: 14,
    styles: DARK_MAP_STYLE,
    disableDefaultUI: true,
    zoomControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });

  // 지도 클릭 → 패널 닫기
  map.addListener("click", closePanel);

  // 줌 버튼
  document.getElementById("zoom-in").addEventListener("click", () => map.setZoom(map.getZoom() + 1));
  document.getElementById("zoom-out").addEventListener("click", () => map.setZoom(map.getZoom() - 1));

  hideLoading();

  // 위치 검색 바 초기화
  initAutocomplete();

  // 현재 위치 취득 시도
  locateUser(true);
}

// ---------- 현재 위치 ----------
function locateUser(initial = false) {
  if (!navigator.geolocation) {
    showToast("📍 위치 서비스를 지원하지 않는 브라우저입니다");
    if (initial) loadStations();
    return;
  }

  showToast("📍 현재 위치를 찾는 중...");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      map.panTo({ lat: userLat, lng: userLng });
      map.setZoom(14);
      placeUserMarker();
      loadStations();
      showToast("✅ 현재 위치를 찾았습니다");
    },
    () => {
      showToast("⚠️ 위치 권한이 없어 기본 위치(강남)를 사용합니다");
      if (initial) {
        placeUserMarker();
        loadStations();
      }
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

// ---------- 위치 검색 (Autocomplete) ----------
function initAutocomplete() {
  const input = document.getElementById("location-search");
  if (!input) return;

  const autocomplete = new google.maps.places.Autocomplete(input, {
    fields: ["geometry", "name"],
    componentRestrictions: { country: "kr" }, // 한국
  });

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) {
      showToast("⚠️ 목록에서 올바른 장소를 선택해주세요");
      return;
    }

    userLat = place.geometry.location.lat();
    userLng = place.geometry.location.lng();
    
    input.blur(); // 포커스 해제
    
    map.panTo({ lat: userLat, lng: userLng });
    map.setZoom(14);
    closePanel();
    placeUserMarker();
    loadStations();
    showToast(`📍 '${place.name}' 주변 주유소를 검색합니다`);
  });
}

// ---------- 사용자 마커 ----------
function placeUserMarker() {
  if (userMarker) userMarker.setMap(null);

  userMarker = new google.maps.Marker({
    position: { lat: userLat, lng: userLng },
    map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: "#4f8cff",
      fillOpacity: 1,
      strokeColor: "#fff",
      strokeWeight: 2.5,
    },
    zIndex: 999,
    title: "내 위치",
  });

  // 반경 원
  if (window._radiusCircle) window._radiusCircle.setMap(null);
  window._radiusCircle = new google.maps.Circle({
    map,
    center: { lat: userLat, lng: userLng },
    radius: currentRadius,
    strokeColor: "#4f8cff",
    strokeOpacity: 0.3,
    strokeWeight: 1.5,
    fillColor: "#4f8cff",
    fillOpacity: 0.04,
  });
}

// ---------- 주유소 로드 ----------
async function loadStations() {
  if (isLoading) return;
  isLoading = true;

  clearMarkers();

  try {
    currentStations = await fetchNearbyStations(userLat, userLng, currentRadius, currentFuel);
    renderMarkers();
    updateStatsBar();
  } catch (e) {
    console.error("주유소 로드 오류:", e);
    showToast("⚠️ 주유소 정보를 불러오는데 실패했습니다");
  } finally {
    isLoading = false;
  }
}

// ---------- 마커 렌더링 ----------
function renderMarkers() {
  const prices = currentStations
    .map((s) => getFuelPrice(s, currentFuel))
    .filter((p) => p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  currentStations.forEach((station) => {
    const price = getFuelPrice(station, currentFuel);
    const color = getPriceColor(price, minPrice, maxPrice);
    const priceText = price ? price.toLocaleString("ko-KR") : "?";

    // 커스텀 마커 (오버레이)
    const overlay = new google.maps.OverlayView();
    overlay.station = station;
    overlay.color = color;
    overlay.priceText = priceText;
    overlay.price = price;
    overlay.minPrice = minPrice;
    overlay.maxPrice = maxPrice;

    overlay.onAdd = function () {
      const div = document.createElement("div");
      div.className = "custom-marker";
      div.innerHTML = `
        <div class="marker-bubble" style="background:${color}">
          ${priceText}원
        </div>
        <div class="marker-tail" style="color:${color}"></div>
      `;
      div.style.position = "absolute";
      div.style.cursor = "pointer";
      div.style.userSelect = "none";

      div.addEventListener("click", (e) => {
        e.stopPropagation();
        openPanel(station, price, minPrice, maxPrice);
      });

      this._div = div;
      const panes = this.getPanes();
      panes.overlayMouseTarget.appendChild(div);
    };

    overlay.draw = function () {
      const proj = this.getProjection();
      const pt = proj.fromLatLngToDivPixel(
        new google.maps.LatLng(station.lat, station.lng)
      );
      if (pt) {
        this._div.style.left = pt.x - 30 + "px";
        this._div.style.top = pt.y - 36 + "px";
      }
    };

    overlay.onRemove = function () {
      if (this._div) {
        this._div.parentNode.removeChild(this._div);
        this._div = null;
      }
    };

    overlay.setMap(map);
    markers.push(overlay);
  });
}

function getFuelPrice(station, fuelCode) {
  if (fuelCode === "B027") return station.gasoline || 0;
  if (fuelCode === "D047") return station.diesel || 0;
  if (fuelCode === "K015") return station.lpg || 0;
  return 0;
}

function clearMarkers() {
  markers.forEach((m) => m.setMap(null));
  markers = [];
}

// ---------- 사이드 패널 열기 ----------
async function openPanel(station, price, minPrice, maxPrice) {
  selectedStation = station;

  // 브랜드 뱃지
  const brandInfo = BRAND_INFO[station.brand] || { label: station.brand, color: "#607D8B" };
  const badge = document.getElementById("panel-brand-badge");
  badge.style.background = brandInfo.color;
  badge.textContent = brandInfo.label.substring(0, 3);

  document.getElementById("panel-station-name").textContent = station.name;
  document.getElementById("panel-address").textContent = station.address;

  // 이동 정보 (로딩 표시)
  document.getElementById("travel-time").textContent = "계산 중...";
  document.getElementById("travel-dist").textContent = "-";

  // 패널 열기
  document.getElementById("side-panel").classList.add("open");

  // 유가 정보
  renderPrices(station, minPrice, maxPrice);

  // 혼잡도
  renderCrowding();

  // 서비스
  renderServices(station);

  // 길찾기 버튼
  document.getElementById("nav-btn").onclick = () => {
    const url = `https://map.kakao.com/link/to/${encodeURIComponent(station.name)},${station.lat},${station.lng}`;
    window.open(url, "_blank");
  };

  // 이동 시간 비동기
  const travel = await fetchTravelTime(userLat, userLng, station.lat, station.lng);
  if (selectedStation && selectedStation.id === station.id) {
    document.getElementById("travel-time").textContent = travel.duration;
    document.getElementById("travel-dist").textContent = travel.distance;
  }

  // 상세 유가 정보 비동기 호출 (전체 유종 표시)
  const detailed = await fetchStationDetail(station.id);
  if (detailed && selectedStation && selectedStation.id === station.id) {
    renderPrices(detailed, minPrice, maxPrice);
    renderServices(detailed); // 서비스 정보도 상세 API 기준 업데이트
  }
}

// ---------- 유가 정보 렌더링 ----------
function renderPrices(station, minPrice, maxPrice) {
  const fuels = [
    { key: "gasoline", label: "⛽ 휘발유", price: station.gasoline },
    { key: "diesel", label: "🛢 경유", price: station.diesel },
    { key: "lpg", label: "💨 LPG", price: station.lpg },
  ];

  const grid = document.getElementById("price-grid");
  grid.innerHTML = "";

  // 가격 범위 계산 (전체)
  const allPrices = currentStations.flatMap((s) => [s.gasoline, s.diesel, s.lpg]).filter((p) => p > 0);
  const globalMin = allPrices.length ? Math.min(...allPrices) : 0;
  const globalMax = allPrices.length ? Math.max(...allPrices) : 0;

  fuels.forEach(({ label, price }) => {
    const color = getPriceColor(price, globalMin, globalMax);
    const labelText = getPriceLabel(price, globalMin, globalMax);
    const rowEl = document.createElement("div");
    rowEl.className = "price-row";

    let priceClass = "none";
    if (price > 0) {
      if (color === "#4CAF50") priceClass = "cheap";
      else if (color === "#FFC107") priceClass = "mid";
      else priceClass = "exp";
    }

    rowEl.innerHTML = `
      <span class="pr-fuel-name">${label}</span>
      <span class="pr-price ${priceClass}">
        ${price ? price.toLocaleString("ko-KR") + "원" : "-"}
      </span>
      ${price ? `<span class="pr-badge ${priceClass}">${labelText}</span>` : ""}
    `;
    grid.appendChild(rowEl);
  });
}

// ---------- 혼잡도 렌더링 ----------
function renderCrowding() {
  const { level, label } = estimateCrowding();
  const color = getCrowdingColor(level);

  document.getElementById("crowding-label").textContent = label;
  document.getElementById("crowding-label").style.color = color;
  document.getElementById("crowding-bar").style.width = level + "%";
  document.getElementById("crowding-bar").style.background = color;
}

// ---------- 서비스 배지 ----------
function renderServices(station) {
  const services = [
    { key: "carWash", label: "세차장", active: station.carWash },
    { key: "convenience", label: "편의점", active: station.convenience },
    { key: "selfService", label: "셀프주유", active: station.selfService },
  ];

  const el = document.getElementById("service-badges");
  el.innerHTML = services
    .map(
      (s) => `<span class="svc-badge ${s.active ? "active" : ""}">${s.label}</span>`
    )
    .join("");
}

// ---------- 패널 닫기 ----------
function closePanel() {
  document.getElementById("side-panel").classList.remove("open");
  selectedStation = null;
}

// ---------- 통계 바 업데이트 ----------
function updateStatsBar() {
  const count = currentStations.length;
  const prices = currentStations
    .map((s) => getFuelPrice(s, currentFuel))
    .filter((p) => p > 0);

  document.getElementById("stat-count").textContent = count + "개";
  document.getElementById("stat-min").textContent = prices.length
    ? Math.min(...prices).toLocaleString("ko-KR") + "원"
    : "-";
  document.getElementById("stat-avg").textContent = prices.length
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length).toLocaleString("ko-KR") + "원"
    : "-";

  const fuelLabels = { B027: "휘발유", D047: "경유", K015: "LPG" };
  document.getElementById("stat-fuel").textContent = fuelLabels[currentFuel] || "";
}

// ---------- 토스트 ----------
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

// ---------- 로딩 ----------
function hideLoading() {
  setTimeout(() => {
    document.getElementById("loading").classList.add("hidden");
  }, 600);
}

// ---------- 구글 지도 스타일 (다크) ----------
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0f1626" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f1626" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4a6fa5" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#8ab4f8" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#4a6fa5" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0d1f18" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#2d5038" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a2644" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0f1626" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#5e7ab5" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#243060" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1a2644" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#8ab4f8" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1a2644" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#4a6fa5" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#07111f" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#1a3a5c" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#07111f" }] },
];

// ---------- 이벤트 리스너 ----------
document.addEventListener("DOMContentLoaded", () => {
  // 연료 탭
  document.querySelectorAll(".fuel-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".fuel-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFuel = btn.dataset.fuel;
      closePanel();
      if (map) loadStations();
    });
  });

  // 반경 슬라이더
  const slider = document.getElementById("radius-slider");
  const radiusVal = document.getElementById("radius-value");
  slider.addEventListener("input", () => {
    currentRadius = parseInt(slider.value);
    radiusVal.textContent = (currentRadius / 1000).toFixed(1) + "km";
    if (window._radiusCircle) window._radiusCircle.setRadius(currentRadius);
  });
  slider.addEventListener("change", () => {
    closePanel();
    if (map) loadStations();
  });

  // 현재 위치
  document.getElementById("locate-btn").addEventListener("click", () => locateUser());

  // 패널 닫기
  document.getElementById("panel-close").addEventListener("click", closePanel);

  // Mock 데이터 배너 (API 키 없을 때)
  if (CONFIG.USE_MOCK_DATA) {
    showToast("🔔 데모 모드: config.js에 API 키를 입력하면 실제 데이터를 사용합니다");
  }
});

// ============================================================
//  API 연동 모듈 (Opinet + Google Maps)
// ============================================================

// ---------- Mock 데이터 ----------
const MOCK_STATIONS = [
  {
    id: "A0001929",
    name: "GS칼텍스 강남직영점",
    brand: "GS",
    address: "서울특별시 강남구 테헤란로 123",
    lat: 37.5013,
    lng: 127.0396,
    gasoline: 1712,
    diesel: 1589,
    lpg: 982,
    carWash: true,
    convenience: true,
    selfService: false,
  },
  {
    id: "A0003721",
    name: "SK에너지 역삼주유소",
    brand: "SK",
    address: "서울특별시 강남구 역삼로 45",
    lat: 37.4994,
    lng: 127.0337,
    gasoline: 1698,
    diesel: 1575,
    lpg: 975,
    carWash: false,
    convenience: true,
    selfService: true,
  },
  {
    id: "A0012345",
    name: "현대오일뱅크 선릉주유소",
    brand: "HD",
    address: "서울특별시 강남구 선릉로 200",
    lat: 37.5045,
    lng: 127.0491,
    gasoline: 1685,
    diesel: 1561,
    lpg: 968,
    carWash: true,
    convenience: false,
    selfService: false,
  },
  {
    id: "A0019876",
    name: "S-OIL 삼성주유소",
    brand: "SO",
    address: "서울특별시 강남구 삼성로 89",
    lat: 37.5088,
    lng: 127.0612,
    gasoline: 1725,
    diesel: 1602,
    lpg: 990,
    carWash: true,
    convenience: true,
    selfService: true,
  },
  {
    id: "A0021111",
    name: "알뜰주유소 강남점",
    brand: "ET",
    address: "서울특별시 강남구 논현로 310",
    lat: 37.5115,
    lng: 127.0271,
    gasoline: 1659,
    diesel: 1534,
    lpg: 955,
    carWash: false,
    convenience: false,
    selfService: true,
  },
  {
    id: "A0033456",
    name: "GS칼텍스 압구정주유소",
    brand: "GS",
    address: "서울특별시 강남구 압구정로 159",
    lat: 37.5279,
    lng: 127.0279,
    gasoline: 1745,
    diesel: 1621,
    lpg: 998,
    carWash: true,
    convenience: true,
    selfService: false,
  },
  {
    id: "A0044567",
    name: "SK에너지 대치주유소",
    brand: "SK",
    address: "서울특별시 강남구 대치로 55",
    lat: 37.4953,
    lng: 127.0611,
    gasoline: 1703,
    diesel: 1579,
    lpg: 978,
    carWash: false,
    convenience: true,
    selfService: false,
  },
  {
    id: "A0055678",
    name: "현대오일뱅크 신사주유소",
    brand: "HD",
    address: "서울특별시 강남구 신사동 547",
    lat: 37.5218,
    lng: 127.0224,
    gasoline: 1691,
    diesel: 1567,
    lpg: 972,
    carWash: true,
    convenience: false,
    selfService: true,
  },
];

const BRAND_INFO = {
  GS: { label: "GS칼텍스", color: "#00A84F" },
  SK: { label: "SK에너지", color: "#FF6A00" },
  HD: { label: "현대오일뱅크", color: "#003087" },
  SO: { label: "S-OIL", color: "#D4A820" },
  ET: { label: "알뜰주유소", color: "#009688" },
  NC: { label: "자가상표", color: "#607D8B" },
};

// ---------- 연료 코드 매핑 ----------
const FUEL_CODE = {
  gasoline: "B027",
  diesel: "D047",
  lpg: "K015",
};

const FUEL_LABEL = {
  B027: "휘발유",
  D047: "경유",
  K015: "LPG",
  gasoline: "휘발유",
  diesel: "경유",
  lpg: "LPG",
};

// ---------- 주유소 검색 ----------
async function fetchNearbyStations(lat, lng, radius, fuelType = "B027") {
  if (CONFIG.USE_MOCK_DATA) {
    return simulateMockStations(lat, lng, radius);
  }

  const katec = wgs84ToKatec(lat, lng);
  // 로컬 프록시 서버를 통해 CORS/IP 제한 우회
  const apiPath = `/api/aroundAll.do?out=json&x=${katec.x}&y=${katec.y}&radius=${radius}&sort=2&prodcd=${fuelType}`;

  try {
    const res = await fetch(apiPath);
    const data = await res.json();

    if (!data.RESULT || !data.RESULT.OIL || data.RESULT.OIL.length === 0) {
      console.warn("오피넷 API: 결과 없음", data);
      return [];
    }

    return data.RESULT.OIL.map((s) => {
      // 오피넷은 KATEC 좌표를 반환하므로 WGS84로 변환
      const katecX = parseFloat(s.GIS_X_COOR);
      const katecY = parseFloat(s.GIS_Y_COOR);
      const wgs84 = katecToWgs84(katecX, katecY);
      
      return {
        id: s.UNI_ID,
        name: s.OS_NM,
        brand: s.POLL_DIV_CD,
        address: s.VAN_ADR,
        lat: wgs84.lat,
        lng: wgs84.lng,
        gasoline: fuelType === "B027" ? (parseFloat(s.PRICE) || 0) : 0,
        diesel:   fuelType === "D047" ? (parseFloat(s.PRICE) || 0) : 0,
        lpg:      fuelType === "K015" ? (parseFloat(s.PRICE) || 0) : 0,
        distance: parseFloat(s.DISTANCE) || haversineDistance(lat, lng, stLat, stLng),
        carWash:      s.CAR_WASH_YN === "Y",
        convenience:  s.CVS_YN === "Y",
        selfService:  s.SELF_YN === "Y",
      };
    });
  } catch (e) {
    console.error("Opinet API 오류:", e);
    return [];
  }
}

// ---------- 주유소 상세 정보 (전 유종 가격) ----------
async function fetchStationDetail(stationId) {
  if (CONFIG.USE_MOCK_DATA) {
    return MOCK_STATIONS.find((s) => s.id === stationId) || null;
  }

  const apiPath = `/api/detailById.do?out=json&id=${stationId}`;

  try {
    const res = await fetch(apiPath);
    const data = await res.json();

    if (!data.RESULT || !data.RESULT.OIL || data.RESULT.OIL.length === 0)
      return null;

    const s = data.RESULT.OIL[0];
    const prices = {};
    if (s.OIL_PRICE) {
      s.OIL_PRICE.forEach((p) => {
        if (p.PRODCD === "B027") prices.gasoline = parseFloat(p.PRICE);
        if (p.PRODCD === "D047") prices.diesel = parseFloat(p.PRICE);
        if (p.PRODCD === "K015") prices.lpg = parseFloat(p.PRICE);
      });
    }

    const katecX = parseFloat(s.GIS_X_COOR);
    const katecY = parseFloat(s.GIS_Y_COOR);
    const wgs84 = katecToWgs84(katecX, katecY);

    return {
      id: s.UNI_ID,
      name: s.OS_NM,
      brand: s.POLL_DIV_CD,
      address: s.VAN_ADR,
      tel: s.TEL,
      lat: wgs84.lat,
      lng: wgs84.lng,
      ...prices,
      carWash:     s.CAR_WASH_YN === "Y",
      convenience: s.CVS_YN === "Y",
      selfService: s.SELF_YN === "Y",
    };
  } catch (e) {
    console.error("상세 정보 API 오류:", e);
    return null;
  }
}

// ---------- 이동 시간 계산 ----------
async function fetchTravelTime(originLat, originLng, destLat, destLng) {
  if (CONFIG.USE_MOCK_DATA || !CONFIG.GOOGLE_MAPS_API_KEY || CONFIG.GOOGLE_MAPS_API_KEY === "YOUR_GOOGLE_MAPS_API_KEY") {
    const dist = haversineDistance(originLat, originLng, destLat, destLng);
    const minutes = Math.round(dist / 300); // 평균 시속 18km 가정
    return { duration: `약 ${Math.max(1, minutes)}분`, distance: formatDistance(dist) };
  }

  return new Promise((resolve) => {
    const service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [{ lat: originLat, lng: originLng }],
        destinations: [{ lat: destLat, lng: destLng }],
        travelMode: google.maps.TravelMode.DRIVING,
        drivingOptions: { departureTime: new Date() },
      },
      (res, status) => {
        if (status === "OK" && res.rows[0].elements[0].status === "OK") {
          const el = res.rows[0].elements[0];
          const durText = el.duration_in_traffic
            ? el.duration_in_traffic.text
            : el.duration.text;
          resolve({ duration: durText, distance: el.distance.text });
        } else {
          const dist = haversineDistance(originLat, originLng, destLat, destLng);
          const minutes = Math.round(dist / 300);
          resolve({ duration: `약 ${Math.max(1, minutes)}분`, distance: formatDistance(dist) });
        }
      }
    );
  });
}

// ---------- Mock 데이터 생성 (검색 반경 필터링) ----------
function simulateMockStations(lat, lng, radius) {
  return MOCK_STATIONS.filter((s) => {
    const dist = haversineDistance(lat, lng, s.lat, s.lng);
    s.distance = dist;
    return dist <= radius + 3000; // 데모 목적으로 넉넉하게
  });
}

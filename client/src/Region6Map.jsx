import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import r6Boundaries from './region6_boundaries.json';

const PROV_CODES = {
  'นครสวรรค์': '60',
  'อุทัยธานี': '61',
  'กำแพงเพชร': '62',
  'ตาก': '63',
  'สุโขทัย': '64',
  'พิษณุโลก': '65',
  'พิจิตร': '66',
  'เพชรบูรณ์': '67',
};

const PROV_BOUNDS = {
  'นครสวรรค์': [[15.1, 99.2], [16.2, 100.8]],
  'อุทัยธานี': [[14.9, 99.0], [15.8, 100.2]],
  'กำแพงเพชร': [[15.8, 99.0], [16.9, 100.1]],
  'ตาก': [[15.9, 98.4], [17.8, 99.4]],
  'สุโขทัย': [[16.7, 99.3], [17.8, 100.2]],
  'พิษณุโลก': [[16.4, 99.9], [17.5, 101.0]],
  'พิจิตร': [[15.9, 100.0], [16.7, 100.8]],
  'เพชรบูรณ์': [[15.3, 100.7], [17.3, 101.8]],
};

const REGION6_BOUNDS = [[14.9, 98.4], [17.8, 101.8]];

// Format full currency
const money = (v) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v || 0);
const pct = (v) => (v == null ? '—' : `${v.toFixed(2)}%`);

/* ── Color Helper matching exact Dashboard Color Indicators ────── */
function getMapColor(val, category) {
  if (val == null || !Number.isFinite(val)) return '#CBD5E1';
  if (category === 'REVENUE') {
    if (val >= 110) return '#10B981'; // ยอดเยี่ยม (≥ 110%)
    if (val >= 100) return '#34D399'; // ดีมาก (100% – 109.9%)
    if (val >= 90) return '#FBBF24';  // กลุ่มเสริมทัพเร่งบูรณาการ (90% – 99.9%)
    if (val >= 70) return '#FB923C';  // เฝ้าระวัง ติดตามอย่างใกล้ชิด (70% – 89.9%)
    return '#EF4444';                 // ติดตามเร่งด่วน (< 70%)
  } else {
    // EXPENSE
    if (val <= 70) return '#10B981';  // บริหารได้ดีเยี่ยม (≤ 70%)
    if (val <= 90) return '#34D399';  // ควบคุมได้รัดกุม (70.1% – 90%)
    if (val <= 100) return '#FBBF24'; // กลุ่มเสริมทัพเร่งบูรณาการ (90.1% – 100%)
    if (val <= 110) return '#FB923C'; // เฝ้าระวัง ติดตามอย่างใกล้ชิด (100.1% – 110%)
    return '#EF4444';                 // ใช้จ่ายเกินงบประมาณ (> 110%)
  }
}

// Find matching post office for a district
function matchDistrictOffice(distName, provName, watchlistData) {
  if (!watchlistData || watchlistData.length === 0) return null;
  const provOffices = watchlistData.filter((o) => o.province === provName);
  if (provOffices.length === 0) return null;

  const cleanDist = (distName || '').replace(/^เมือง/, '').trim();

  // 1. Exact match on postname === distName or cleanDist
  let found = provOffices.find((o) => o.postname === distName || o.postname === cleanDist);
  if (found) return found;

  // 2. Substring match
  found = provOffices.find((o) => o.postname.includes(cleanDist) || (cleanDist.length >= 3 && cleanDist.includes(o.postname)));
  if (found) return found;

  // 3. Fallback to main post office of the province
  found = provOffices.find((o) => o.postname === provName);
  return found || provOffices[0] || null;
}

export default function Region6Map({
  watchlistData,
  category,
  selectedProvince,
  selectedPostcode,
  onSelectLocation,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const geojsonLayerRef = useRef(null);
  const labelsLayerRef = useRef(null);

  const [mapCompareMode, setMapCompareMode] = useState('target'); // 'target' vs 'yoy'
  const [internalDrillProv, setInternalDrillProv] = useState(selectedProvince || null);

  // Sync internal drill state with parent selectedProvince
  useEffect(() => {
    setInternalDrillProv(selectedProvince || null);
  }, [selectedProvince]);

  // Aggregate Province Data
  const provinceAggregates = useMemo(() => {
    const agg = {};
    Object.keys(PROV_CODES).forEach((p) => {
      agg[p] = { province: p, actual: 0, target: 0, lastYearAmount: 0, count: 0 };
    });

    (watchlistData || []).forEach((item) => {
      const p = item.province;
      if (agg[p]) {
        agg[p].actual += item.actual || 0;
        agg[p].target += item.target || 0;
        agg[p].lastYearAmount += item.lastYearAmount || 0;
        agg[p].count += 1;
      }
    });

    Object.values(agg).forEach((p) => {
      p.targetAchievementPct = p.target > 0 ? (p.actual / p.target) * 100 : null;
      p.yoyGrowthPct = p.lastYearAmount > 0 ? (p.actual / p.lastYearAmount) * 100 : null;
    });

    return agg;
  }, [watchlistData]);

  // Total summary for bottom-left card
  const summaryBoxData = useMemo(() => {
    if (internalDrillProv && provinceAggregates[internalDrillProv]) {
      const pData = provinceAggregates[internalDrillProv];
      const compVal = mapCompareMode === 'target' ? pData.targetAchievementPct : pData.yoyGrowthPct;
      const compareTotal = mapCompareMode === 'target' ? pData.target : pData.lastYearAmount;
      return {
        title: `[ปข.6] ปจ.${internalDrillProv}`,
        targetOrLastYearLabel: mapCompareMode === 'target' ? 'เป้าหมาย' : 'ปีก่อนหน้า',
        targetOrLastYearValue: compareTotal,
        actualLabel: category === 'REVENUE' ? 'รายได้' : 'ค่าใช้จ่าย',
        actualValue: pData.actual,
        pctLabel: mapCompareMode === 'target' ? '%ความสำเร็จ' : '%การเติบโต YoY',
        pctValue: compVal,
      };
    }

    // Overall 8 Provinces Total
    let totalAct = 0;
    let totalTar = 0;
    let totalLast = 0;
    Object.values(provinceAggregates).forEach((p) => {
      totalAct += p.actual;
      totalTar += p.target;
      totalLast += p.lastYearAmount;
    });
    const totalComp = mapCompareMode === 'target'
      ? (totalTar > 0 ? (totalAct / totalTar) * 100 : null)
      : (totalLast > 0 ? (totalAct / totalLast) * 100 : null);

    return {
      title: 'ภาพรวม 8 จังหวัด ปข.6',
      targetOrLastYearLabel: mapCompareMode === 'target' ? 'เป้าหมาย' : 'ปีก่อนหน้า',
      targetOrLastYearValue: mapCompareMode === 'target' ? totalTar : totalLast,
      actualLabel: category === 'REVENUE' ? 'รายได้' : 'ค่าใช้จ่าย',
      actualValue: totalAct,
      pctLabel: mapCompareMode === 'target' ? '%ความสำเร็จ' : '%การเติบโต YoY',
      pctValue: totalComp,
    };
  }, [internalDrillProv, provinceAggregates, mapCompareMode, category]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false,
      zoomSnap: 0.1,
      zoomDelta: 0.25,
      maxBounds: [[13.5, 96.0], [19.5, 104.0]],
      minZoom: 6,
      maxZoom: 14,
    });

    // Clean, minimalist Positron / CartoDB Light Tile
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    geojsonLayerRef.current = L.layerGroup().addTo(map);
    labelsLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render Polygons and Labels
  useEffect(() => {
    if (!mapInstanceRef.current || !geojsonLayerRef.current || !labelsLayerRef.current) return;
    const map = mapInstanceRef.current;
    const geoLayer = geojsonLayerRef.current;
    const labelLayer = labelsLayerRef.current;

    geoLayer.clearLayers();
    labelLayer.clearLayers();

    if (!internalDrillProv) {
      // ═══════════════════════════════════════════════════════════════
      // 1. OVERVIEW LEVEL: 8 PROVINCES CHOROPLETH (ZOOMED TO FILL)
      // ═══════════════════════════════════════════════════════════════
      const provGeoJson = L.geoJSON(r6Boundaries.provinces, {
        style: (feature) => {
          const provName = feature.properties.prov_name;
          const pData = provinceAggregates[provName];
          const val = mapCompareMode === 'target' ? pData?.targetAchievementPct : pData?.yoyGrowthPct;
          const fillColor = getMapColor(val, category);

          return {
            fillColor,
            fillOpacity: 0.9,
            color: '#334155',
            weight: 1.5,
            dashArray: '',
          };
        },
        onEachFeature: (feature, layer) => {
          const provName = feature.properties.prov_name;
          const provCode = PROV_CODES[provName] || '';
          const pData = provinceAggregates[provName];
          const val = mapCompareMode === 'target' ? pData?.targetAchievementPct : pData?.yoyGrowthPct;

          layer.on({
            mouseover: (e) => {
              const l = e.target;
              l.setStyle({ weight: 3, color: '#0F172A', fillOpacity: 1 });
            },
            mouseout: (e) => {
              provGeoJson.resetStyle(e.target);
            },
            click: () => {
              setInternalDrillProv(provName);
              if (onSelectLocation) {
                onSelectLocation({ province: provName, postcode: '' });
              }
            },
          });

          // Compute Center of polygon for permanent Label
          const bounds = layer.getBounds();
          const center = bounds.getCenter();

          // Custom center tweak for elongated provinces
          let labelLat = center.lat;
          let labelLng = center.lng;
          if (provName === 'ตาก') { labelLat += 0.2; labelLng -= 0.1; }
          if (provName === 'เพชรบูรณ์') { labelLat -= 0.1; }
          if (provName === 'พิษณุโลก') { labelLat += 0.05; }

          const labelHtml = `
            <div class="custom-map-prov-label">
              <span class="prov-code">${provCode}</span>
              <strong class="prov-name">${provName}</strong>
              <span class="prov-pct">${pct(val)}</span>
            </div>
          `;

          const labelMarker = L.marker([labelLat, labelLng], {
            icon: L.divIcon({
              className: 'custom-div-icon',
              html: labelHtml,
              iconSize: [80, 48],
              iconAnchor: [40, 24],
            }),
            interactive: true,
          });

          labelMarker.on('click', () => {
            setInternalDrillProv(provName);
            if (onSelectLocation) {
              onSelectLocation({ province: provName, postcode: '' });
            }
          });

          labelLayer.addLayer(labelMarker);
        },
      });

      geoLayer.addLayer(provGeoJson);
      map.setView([16.35, 100.1], 7.3);
    } else {
      // ═══════════════════════════════════════════════════════════════
      // 2. DRILLED-DOWN LEVEL: DISTRICT / AMPHUR CHOROPLETH
      // ═══════════════════════════════════════════════════════════════
      const filteredDistFeatures = r6Boundaries.districts.features.filter(
        (f) => f.properties.prov_name === internalDrillProv
      );

      const distGeoJson = L.geoJSON(
        { type: 'FeatureCollection', features: filteredDistFeatures },
        {
          style: (feature) => {
            const distName = feature.properties.dist_name;
            const matchedOffice = matchDistrictOffice(distName, internalDrillProv, watchlistData);
            const val = mapCompareMode === 'target'
              ? matchedOffice?.targetAchievementPct
              : matchedOffice?.yoyGrowthPct;
            const fillColor = getMapColor(val, category);
            const isSelected = selectedPostcode && matchedOffice?.postcode === selectedPostcode;

            return {
              fillColor,
              fillOpacity: 0.9,
              color: isSelected ? '#0F172A' : '#475569',
              weight: isSelected ? 3.5 : 1.2,
            };
          },
          onEachFeature: (feature, layer) => {
            const distName = feature.properties.dist_name;
            const matchedOffice = matchDistrictOffice(distName, internalDrillProv, watchlistData);
            const val = mapCompareMode === 'target'
              ? matchedOffice?.targetAchievementPct
              : matchedOffice?.yoyGrowthPct;

            layer.on({
              mouseover: (e) => {
                const l = e.target;
                l.setStyle({ weight: 2.5, color: '#0F172A', fillOpacity: 1 });
              },
              mouseout: (e) => {
                distGeoJson.resetStyle(e.target);
              },
              click: () => {
                if (matchedOffice && onSelectLocation) {
                  onSelectLocation({
                    province: internalDrillProv,
                    postcode: matchedOffice.postcode,
                  });
                }
              },
            });

            const center = layer.getBounds().getCenter();
            const displayName = matchedOffice ? matchedOffice.postname : distName;

            const labelHtml = `
              <div class="custom-map-dist-label">
                <strong class="dist-name">${displayName}</strong>
                <span class="dist-pct">${pct(val)}</span>
              </div>
            `;

            const labelMarker = L.marker([center.lat, center.lng], {
              icon: L.divIcon({
                className: 'custom-div-icon',
                html: labelHtml,
                iconSize: [70, 36],
                iconAnchor: [35, 18],
              }),
              interactive: true,
            });

            labelMarker.on('click', () => {
              if (matchedOffice && onSelectLocation) {
                onSelectLocation({
                  province: internalDrillProv,
                  postcode: matchedOffice.postcode,
                });
              }
            });

            labelLayer.addLayer(labelMarker);
          },
        }
      );

      geoLayer.addLayer(distGeoJson);
      map.fitBounds(distGeoJson.getBounds(), { padding: [10, 10] });
    }
  }, [internalDrillProv, provinceAggregates, watchlistData, mapCompareMode, category, selectedPostcode, onSelectLocation]);

  const handleBackToOverview = () => {
    setInternalDrillProv(null);
    if (onSelectLocation) {
      onSelectLocation({ province: '', postcode: '' });
    }
  };

  return (
    <section className="panel r6-map-card">
      {/* Map Header & Controls */}
      <div className="r6-map-header">
        <div className="r6-map-title-row">
          {internalDrillProv ? (
            <div className="r6-drill-title-wrap">
              <button className="r6-back-btn" onClick={handleBackToOverview}>
                ← ย้อนกลับ
              </button>
              <h2>[ปข.6] ปจ.{internalDrillProv}</h2>
            </div>
          ) : (
            <h2>🗺️ แผนที่ผลการดำเนินงาน 8 จังหวัด (สังกัด ปข.6)</h2>
          )}
        </div>

        <div className="r6-map-actions">
          <div className="r6-map-toggle">
            <button
              className={mapCompareMode === 'target' ? 'active' : ''}
              onClick={() => setMapCompareMode('target')}
            >
              🎯 เทียบเป้าหมาย
            </button>
            <button
              className={mapCompareMode === 'yoy' ? 'active' : ''}
              onClick={() => setMapCompareMode('yoy')}
            >
              📅 เทียบปีก่อน (YoY)
            </button>
          </div>
        </div>
      </div>

      {/* Map Container Viewport */}
      <div className="r6-map-viewport-wrapper">
        <div ref={mapContainerRef} className="r6-leaflet-map" />

        {/* Bottom-Left Summary Box (matching user image) */}
        <div className="r6-map-stat-box">
          <div className="r6-stat-row">
            <span className="r6-stat-lbl">{summaryBoxData.targetOrLastYearLabel}</span>
            <strong className="r6-stat-num">{money(summaryBoxData.targetOrLastYearValue)}</strong>
          </div>
          <div className="r6-stat-row">
            <span className="r6-stat-lbl">{summaryBoxData.actualLabel}</span>
            <strong className="r6-stat-num">{money(summaryBoxData.actualValue)}</strong>
          </div>
          <div className="r6-stat-row highlight">
            <span className="r6-stat-lbl">{summaryBoxData.pctLabel}</span>
            <strong className="r6-stat-num pct">{pct(summaryBoxData.pctValue)}</strong>
          </div>
        </div>

        {/* Bottom-Right Legend Box (matching Dashboard Color Indicators) */}
        <div className="r6-map-legend-box">
          <div className="r6-legend-title">เกณฑ์ประเมิน ({category === 'REVENUE' ? 'รายได้' : 'ค่าใช้จ่าย'})</div>
          {category === 'REVENUE' ? (
            <>
              <div className="r6-legend-item">
                <span className="r6-legend-box-color" style={{ backgroundColor: '#10B981' }}></span>
                <span>ยอดเยี่ยม (≥ 110%)</span>
              </div>
              <div className="r6-legend-item">
                <span className="r6-legend-box-color" style={{ backgroundColor: '#34D399' }}></span>
                <span>ดีมาก (100% – 109.9%)</span>
              </div>
              <div className="r6-legend-item">
                <span className="r6-legend-box-color" style={{ backgroundColor: '#FBBF24' }}></span>
                <span>เสริมทัพเร่งบูรณาการ (90% – 99.9%)</span>
              </div>
              <div className="r6-legend-item">
                <span className="r6-legend-box-color" style={{ backgroundColor: '#FB923C' }}></span>
                <span>เฝ้าระวัง ติดตามใกล้ชิด (70% – 89.9%)</span>
              </div>
              <div className="r6-legend-item">
                <span className="r6-legend-box-color" style={{ backgroundColor: '#EF4444' }}></span>
                <span>ติดตามเร่งด่วน (&lt; 70%)</span>
              </div>
            </>
          ) : (
            <>
              <div className="r6-legend-item">
                <span className="r6-legend-box-color" style={{ backgroundColor: '#10B981' }}></span>
                <span>บริหารได้ดีเยี่ยม (≤ 70%)</span>
              </div>
              <div className="r6-legend-item">
                <span className="r6-legend-box-color" style={{ backgroundColor: '#34D399' }}></span>
                <span>ควบคุมได้รัดกุม (70.1% – 90%)</span>
              </div>
              <div className="r6-legend-item">
                <span className="r6-legend-box-color" style={{ backgroundColor: '#FBBF24' }}></span>
                <span>เสริมทัพเร่งบูรณาการ (90.1% – 100%)</span>
              </div>
              <div className="r6-legend-item">
                <span className="r6-legend-box-color" style={{ backgroundColor: '#FB923C' }}></span>
                <span>เฝ้าระวัง ติดตามใกล้ชิด (100.1% – 110%)</span>
              </div>
              <div className="r6-legend-item">
                <span className="r6-legend-box-color" style={{ backgroundColor: '#EF4444' }}></span>
                <span>ใช้จ่ายเกินงบประมาณ (&gt; 110%)</span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

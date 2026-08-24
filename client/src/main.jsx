import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Region6Map from './Region6Map.jsx';
import {
  PROVINCE_CENTERS,
  REGION6_CENTER,
  getOfficeCoords,
  compactMoney,
} from './geoData.js';
import './styles.css';

const money = (value) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(value || 0);
const pct = (value) => (value == null ? '—' : `${value.toFixed(2)}%`);
const api = (path) => fetch(`/api/v1${path}`).then((r) => r.json());

const THAI_MONTHS = [
  { value: 1, name: 'มกราคม' },
  { value: 2, name: 'กุมภาพันธ์' },
  { value: 3, name: 'มีนาคม' },
  { value: 4, name: 'เมษายน' },
  { value: 5, name: 'พฤษภาคม' },
  { value: 6, name: 'มิถุนายน' },
  { value: 7, name: 'กรกฎาคม' },
  { value: 8, name: 'สิงหาคม' },
  { value: 9, name: 'กันยายน' },
  { value: 10, name: 'ตุลาคม' },
  { value: 11, name: 'พฤศจิกายน' },
  { value: 12, name: 'ธันวาคม' },
];

const DEFAULT_SOURCES = ['SAP', 'COD', 'FUZE', 'LOTTO', 'ECOMMERCE', 'DIT'];
const SOURCE_LABELS = {
  SAP: 'SAP',
  COD: 'COD',
  FUZE: 'FUZE',
  LOTTO: 'LOTTO',
  ECOMMERCE: 'e-Commerce',
  DIT: 'DIT',
};

const DONUT_COLORS = [
  '#2563EB', '#0D9488', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4',
  '#10B981', '#6366F1', '#14B8A6', '#F97316', '#3B82F6', '#84CC16',
];

/* ── Evaluation Criteria Threshold Helper ──────────────────────── */
function getEvaluationStatus(val, category) {
  if (val == null || !Number.isFinite(val)) {
    return { level: 'neutral', label: 'ไม่มีเป้า/ข้อมูล', badgeClass: 'badge-neutral', dotColor: '#94A3B8' };
  }
  if (category === 'REVENUE') {
    if (val >= 110) return { level: 'excellent', label: 'ยอดเยี่ยม (≥ 110%)', badgeClass: 'badge-excellent', dotColor: '#10B981' };
    if (val >= 100) return { level: 'very-good', label: 'ดีมาก (100% – 109.9%)', badgeClass: 'badge-very-good', dotColor: '#34D399' };
    if (val >= 90) return { level: 'boost', label: 'กลุ่มเสริมทัพเร่งบูรณาการ (90% – 99.9%)', badgeClass: 'badge-boost', dotColor: '#FBBF24' };
    if (val >= 70) return { level: 'watch', label: 'เฝ้าระวัง ติดตามอย่างใกล้ชิด (70% – 89.9%)', badgeClass: 'badge-watch', dotColor: '#FB923C' };
    return { level: 'urgent', label: 'ติดตามเร่งด่วน (< 70%)', badgeClass: 'badge-urgent', dotColor: '#EF4444' };
  } else {
    // EXPENSE
    if (val <= 70) return { level: 'excellent', label: 'บริหารได้ดีเยี่ยม (≤ 70%)', badgeClass: 'badge-excellent', dotColor: '#10B981' };
    if (val <= 90) return { level: 'very-good', label: 'ควบคุมได้รัดกุม (70.1% – 90%)', badgeClass: 'badge-very-good', dotColor: '#34D399' };
    if (val <= 100) return { level: 'boost', label: 'กลุ่มเสริมทัพเร่งบูรณาการ (90.1% – 100%)', badgeClass: 'badge-boost', dotColor: '#FBBF24' };
    if (val <= 110) return { level: 'watch', label: 'เฝ้าระวัง ติดตามอย่างใกล้ชิด (100.1% – 110%)', badgeClass: 'badge-watch', dotColor: '#FB923C' };
    return { level: 'urgent', label: 'ใช้จ่ายเกินงบประมาณ (> 110%)', badgeClass: 'badge-urgent', dotColor: '#EF4444' };
  }
}

function Card({ label, value, detail, tone }) {
  return (
    <section className="card">
      <p>{label}</p>
      <strong className={tone}>{money(value)} <small>บาท</small></strong>
      {detail && <span>{detail}</span>}
    </section>
  );
}

/* ── Breadcrumb component ─────────────────────────────────────── */
function Breadcrumb({ items, onNavigate }) {
  return (
    <nav className="breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="breadcrumb-item-wrapper">
          {i > 0 && <span className="breadcrumb-sep">›</span>}
          {i < items.length - 1 ? (
            <button className="breadcrumb-btn" onClick={() => onNavigate(i)}>{item}</button>
          ) : (
            <span className="breadcrumb-current">{item}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ── GaugeBar Component (Semi-circle 180° Radial Gauge) ────────── */
function GaugeBar({ actual, target, lastYear, yoyGrowthPct, category }) {
  const pctVal = target > 0 ? (actual / target) * 100 : null;
  const status = getEvaluationStatus(pctVal, category);

  // Map pct to -90 deg (0%) through +90 deg (150%+)
  const clampedPct = Math.min(Math.max(pctVal || 0, 0), 150);
  const angle = -90 + (clampedPct / 150) * 180;

  const needleLen = 65;
  const rad = (angle * Math.PI) / 180;
  const needleX = 110 + needleLen * Math.cos(rad);
  const needleY = 100 + needleLen * Math.sin(rad);

  return (
    <div className="gauge-panel">
      <div className="gauge-viz-side">
        <div className="gauge-svg-wrap">
          <svg viewBox="0 0 220 125" className="gauge-svg">
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="35%" stopColor="#FB923C" />
                <stop offset="55%" stopColor="#FBBF24" />
                <stop offset="75%" stopColor="#34D399" />
                <stop offset="100%" stopColor="#10B981" />
              </linearGradient>
            </defs>
            {/* Background Track */}
            <path
              d="M 25 100 A 85 85 0 0 1 195 100"
              fill="none"
              stroke="#E2E8F0"
              strokeWidth="20"
              strokeLinecap="round"
            />
            {/* Colored Gradient Track */}
            <path
              d="M 25 100 A 85 85 0 0 1 195 100"
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth="18"
              strokeLinecap="round"
              opacity="0.9"
            />
            {/* Needle */}
            <line
              x1="110"
              y1="100"
              x2={needleX}
              y2={needleY}
              stroke="#1E293B"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle cx="110" cy="100" r="7" fill="#1E293B" />
            <circle cx="110" cy="100" r="3" fill="#FFFFFF" />
          </svg>
          <div className="gauge-center-info">
            <span className="gauge-pct-val" style={{ color: status.dotColor }}>
              {pct(pctVal)}
            </span>
            <span className={`eval-badge ${status.badgeClass} gauge-badge`}>
              <span className="eval-dot" style={{ backgroundColor: status.dotColor }}></span>
              {status.label.split(' (')[0]}
            </span>
          </div>
        </div>
      </div>

      {/* Numerical Metrics Strip */}
      <div className="gauge-metrics-strip">
        <div className="gauge-metric-box">
          <span className="gmb-label">ผลงานจริง (Actual)</span>
          <strong className="gmb-val primary">{money(actual)} <small>บาท</small></strong>
          <span className="gmb-sub">ยอดสะสมช่วงที่เลือก</span>
        </div>
        <div className="gauge-metric-box">
          <span className="gmb-label">เป้าหมาย (Target)</span>
          <strong className="gmb-val">{money(target)} <small>บาท</small></strong>
          <span className="gmb-sub">บรรลุเป้า {pct(pctVal)}</span>
        </div>
        <div className="gauge-metric-box">
          <span className="gmb-label">ปีก่อนหน้า (Last Year)</span>
          <strong className="gmb-val muted">{money(lastYear)} <small>บาท</small></strong>
          <span className="gmb-sub">เปรียบเทียบ YoY</span>
        </div>
        <div className="gauge-metric-box">
          <span className="gmb-label">การเติบโต (YoY)</span>
          <strong className={`gmb-val ${(yoyGrowthPct || 0) >= 100 ? 'good' : 'down'}`}>
            {pct(yoyGrowthPct)}
          </strong>
          <span className="gmb-sub">
            {actual >= lastYear ? 'เพิ่มขึ้นจากปีก่อน' : 'ชะลอตัวลงจากปีก่อน'}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── SAP Donut Chart Component (Pie Chart with Drill-down) ─────── */
function SapDonutChart({
  breakdown,
  drillLevel,
  onDrill,
  onBack,
  breadcrumbItems,
  onBreadcrumbNav,
  category,
}) {
  const data = useMemo(() => {
    if (!breakdown || breakdown.length === 0) return [];
    const valid = breakdown.filter((item) => item.actual > 0);
    const totalSum = valid.reduce((s, r) => s + (r.actual || 0), 0);
    return valid.map((item, idx) => ({
      name: item.name,
      actual: item.actual,
      target: item.target,
      sharePct: totalSum > 0 ? (item.actual / totalSum) * 100 : 0,
      color: DONUT_COLORS[idx % DONUT_COLORS.length],
    }));
  }, [breakdown]);

  const totalActual = useMemo(() => data.reduce((s, r) => s + r.actual, 0), [data]);
  const levelLabel = drillLevel === 'account' ? 'รายการบัญชี' : drillLevel === 'evm' ? 'EVM Service' : 'กลุ่มธุรกิจ';
  const canGoBack = Boolean(drillLevel);

  return (
    <section className="panel donut-panel">
      <div className="donut-header">
        <div>
          <h2>🍩 สัดส่วนผลการดำเนินงาน ({levelLabel})</h2>
          <p className="hint-text">คลิกที่ชิ้นส่วนโดนัทเพื่อเจาะลึก | เลือกกลุ่มด้านล่างเพื่อดูภาพกว้างขึ้น</p>
        </div>
        <div className="donut-total-badge">
          <span>ยอดรวม:</span>
          <strong>{compactMoney(totalActual)} บาท</strong>
        </div>
      </div>

      {breadcrumbItems && breadcrumbItems.length > 1 && (
        <div className="donut-breadcrumb-bar">
          <Breadcrumb items={breadcrumbItems} onNavigate={onBreadcrumbNav} />
        </div>
      )}

      <div className="donut-chart-container">
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={data}
              dataKey="actual"
              nameKey="name"
              cx="50%"
              cy="48%"
              innerRadius={68}
              outerRadius={105}
              paddingAngle={3}
              onClick={(entry) => {
                const rowName = entry?.name || entry?.payload?.name;
                if (rowName && onDrill) {
                  onDrill({ name: rowName });
                }
              }}
              cursor="pointer"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val, name, entry) => [
                `${money(val)} บาท (${entry.payload.sharePct.toFixed(1)}%)`,
                name,
              ]}
            />
            <Legend
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              wrapperStyle={{ paddingTop: 8, fontSize: '11.5px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/* ── Main App ─────────────────────────────────────────────────── */
function App() {
  const [meta, setMeta] = useState(null);
  // Default to BI mode
  const [mode, setMode] = useState('BI');
  const [category, setCategory] = useState('REVENUE');
  const [yearBE, setYearBE] = useState('2569');

  // Filter States with smart defaults
  const [monthFrom, setMonthFrom] = useState('1');
  const [monthTo, setMonthTo] = useState('6');
  const [province, setProvince] = useState('');
  const [postcode, setPostcode] = useState('');

  // SAP specific filters
  const [selectedSources, setSelectedSources] = useState(DEFAULT_SOURCES);
  const [filterGroup, setFilterGroup] = useState('');
  const [filterEvm, setFilterEvm] = useState('');
  const [filterAccount, setFilterAccount] = useState('');

  // SAP Table Breakdown Dimension: 'service' (กลุ่มบริการ) vs 'area' (รายจังหวัด/ที่ทำการ)
  const [dimension, setDimension] = useState('service');

  // Data states
  const [summary, setSummary] = useState(null);
  const [detail, setDetail] = useState(null);
  const [trend, setTrend] = useState([]);
  const [watchlistData, setWatchlistData] = useState([]);

  // Watchlist Component States
  const [watchCompareMode, setWatchCompareMode] = useState('target'); // 'target' vs 'yoy'
  const [tableCompareMode, setTableCompareMode] = useState('target'); // 'target' vs 'yoy'
  const [watchSearch, setWatchSearch] = useState('');
  const [showIndicators, setShowIndicators] = useState(true);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [isWatchlistHidden, setIsWatchlistHidden] = useState(false); // Completely hide bubble
  const [previousFilterState, setPreviousFilterState] = useState(null);

  const handleSelectWatchOffice = (item) => {
    if (postcode === item.postcode) {
      if (previousFilterState) {
        setProvince(previousFilterState.province || '');
        setPostcode(previousFilterState.postcode || '');
        setPreviousFilterState(null);
      } else {
        setPostcode('');
      }
    } else {
      if (!previousFilterState) {
        setPreviousFilterState({ province, postcode });
      }
      setProvince(item.province);
      setPostcode(item.postcode);
    }
  };

  const handleMapSelectLocation = useCallback(({ province: p, postcode: c }) => {
    setProvince(p || '');
    setPostcode(c || '');
    setPreviousFilterState(null);
  }, []);

  // Drill-down state (in-table breakdown)
  const [drillLevel, setDrillLevel] = useState(null);
  const [drillGroup, setDrillGroup] = useState(null);
  const [drillEvm, setDrillEvm] = useState(null);
  const [drillProvince, setDrillProvince] = useState(null);

  // Load Meta initially with smart defaults
  useEffect(() => {
    api('/meta/filters').then((x) => {
      if (x?.success && x.data) {
        setMeta(x.data);
        const latestY = x.data.yearsBE?.length ? String(x.data.yearsBE.at(-1)) : '2569';
        setYearBE(latestY);
        setMonthFrom('1'); // มกราคมเสมอ
        const latestM = x.data.latestMonthByYearBE?.[latestY] || 6;
        setMonthTo(String(latestM)); // เดือนล่าสุดที่มีข้อมูลเสมอ
      }
    });
  }, []);

  // Postcode options derived from Province selection
  const availablePostcodes = useMemo(() => {
    if (!meta?.postcodesByProvince) return [];
    if (province) {
      return meta.postcodesByProvince[province] || [];
    }
    const all = [];
    Object.entries(meta.postcodesByProvince).forEach(([prov, list]) => {
      list.forEach((item) => all.push({ ...item, province: prov }));
    });
    return all;
  }, [meta, province]);

  // SAP Service Hierarchy options
  const groupOptions = useMemo(() => {
    if (!meta?.serviceHierarchy || !meta.serviceHierarchy[category]) return [];
    return Object.keys(meta.serviceHierarchy[category]);
  }, [meta, category]);

  const evmOptions = useMemo(() => {
    if (!meta?.serviceHierarchy || !filterGroup || !meta.serviceHierarchy[category]?.[filterGroup]) return [];
    return Object.keys(meta.serviceHierarchy[category][filterGroup]);
  }, [meta, category, filterGroup]);

  const accountOptions = useMemo(() => {
    if (!meta?.serviceHierarchy || !filterGroup || !filterEvm || !meta.serviceHierarchy[category]?.[filterGroup]?.[filterEvm]) return [];
    return meta.serviceHierarchy[category][filterGroup][filterEvm];
  }, [meta, category, filterGroup, filterEvm]);

  const handleProvinceChange = (newProv) => {
    setProvince(newProv);
    setPostcode('');
    setDrillProvince(null);
    setPreviousFilterState(null);
    if (drillLevel === 'postcode') setDrillLevel(null);
  };

  // Reset drill-down when high-level filters change
  useEffect(() => {
    setDrillLevel(null);
    setDrillGroup(null);
    setDrillEvm(null);
    setDrillProvince(null);
  }, [mode, category, yearBE, monthFrom, monthTo, province, postcode, selectedSources, filterGroup, filterEvm, filterAccount, dimension]);

  const handleCategoryChange = (newCat) => {
    setCategory(newCat);
    setFilterGroup('');
    setFilterEvm('');
    setFilterAccount('');
  };

  const handleGroupFilterChange = (newGroup) => {
    setFilterGroup(newGroup);
    setFilterEvm('');
    setFilterAccount('');
  };

  const handleEvmFilterChange = (newEvm) => {
    setFilterEvm(newEvm);
    setFilterAccount('');
  };

  const toggleSource = (src) => {
    setSelectedSources((prev) => {
      if (prev.includes(src)) {
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== src);
      }
      return [...prev, src];
    });
  };

  const selectAllSources = () => setSelectedSources(DEFAULT_SOURCES);

  // Build Query Object
  const buildQueryParams = useCallback((extra = {}) => {
    const params = new URLSearchParams({
      yearBE,
      mode,
      category,
      ...(monthFrom && { monthFrom }),
      ...(monthTo && { monthTo }),
      ...(province && { province }),
      ...(postcode && { postcode }),
      ...extra,
    });

    if (mode === 'SAP') {
      if (selectedSources.length < DEFAULT_SOURCES.length) {
        params.set('sources', selectedSources.join(','));
      }
      if (filterGroup) params.set('filterGroup', filterGroup);
      if (filterEvm) params.set('filterEvm', filterEvm);
      if (filterAccount) params.set('filterAccount', filterAccount);
    }

    return params;
  }, [yearBE, mode, category, monthFrom, monthTo, province, postcode, selectedSources, filterGroup, filterEvm, filterAccount]);

  // Fetch Summary (Overall System Total)
  useEffect(() => {
    if (!yearBE) return;
    const summaryParams = new URLSearchParams({
      yearBE,
      mode,
    });
    api(`/dashboard/summary?${summaryParams}`).then((sumRes) => {
      if (sumRes?.success) setSummary(sumRes.data);
    });
  }, [yearBE, mode]);

  // Fetch Trend
  useEffect(() => {
    if (!yearBE) return;
    const trendParams = buildQueryParams();
    api(`/dashboard/trend?${trendParams}`).then((trendRes) => {
      if (trendRes?.success) setTrend(trendRes.data);
    });
  }, [buildQueryParams, yearBE]);

  // Fetch Detail
  const loadDetail = useCallback(() => {
    if (!yearBE) return;

    const extra = {};
    if (mode === 'SAP') {
      extra.dimension = dimension;
      if (dimension === 'service') {
        if (drillLevel) extra.drillLevel = drillLevel;
        if (drillGroup) extra.drillGroup = drillGroup;
        if (drillEvm) extra.drillEvm = drillEvm;
      } else {
        if (drillLevel) extra.drillLevel = drillLevel;
        if (drillProvince) extra.drillProvince = drillProvince;
      }
    } else {
      if (drillLevel) extra.drillLevel = drillLevel;
      if (drillProvince) extra.drillProvince = drillProvince;
    }

    const detailParams = buildQueryParams(extra);
    api(`/dashboard/detail?${detailParams}`).then((res) => {
      if (res?.success) setDetail(res.data);
    });
  }, [buildQueryParams, yearBE, mode, dimension, drillLevel, drillGroup, drillEvm, drillProvince]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Fetch Watchlist
  useEffect(() => {
    if (!yearBE) return;
    const q = buildQueryParams();
    api(`/dashboard/watchlist?${q}`).then((res) => {
      if (res?.success) setWatchlistData(res.data);
    });
  }, [buildQueryParams, yearBE]);

  const isServiceDim = mode === 'SAP' && dimension === 'service';

  // Table Drill Handlers
  const handleDrill = (row) => {
    if (isServiceDim) {
      const level = detail?.drillLevel;
      if (level === 'group') {
        setDrillGroup(row.name);
        setDrillLevel('evm');
      } else if (level === 'evm') {
        setDrillEvm(row.name);
        setDrillLevel('account');
      }
    } else {
      const level = detail?.drillLevel;
      if (level === 'province') {
        setDrillProvince(row.name);
        setDrillLevel('postcode');
      }
    }
  };

  const canDrill = isServiceDim
    ? (detail?.drillLevel !== 'account')
    : (detail?.drillLevel === 'province');

  // Breadcrumb navigation items
  const breadcrumbItems = useMemo(() => {
    const items = [];
    if (isServiceDim) {
      items.push('กลุ่มธุรกิจ');
      if (drillGroup) items.push(drillGroup);
      if (drillEvm) items.push(drillEvm);
    } else {
      items.push('จังหวัด');
      if (drillProvince) items.push(drillProvince);
    }
    return items;
  }, [isServiceDim, drillGroup, drillEvm, drillProvince]);

  const handleBreadcrumbNav = (index) => {
    if (isServiceDim) {
      if (index === 0) {
        setDrillLevel(null);
        setDrillGroup(null);
        setDrillEvm(null);
      } else if (index === 1) {
        setDrillLevel('evm');
        setDrillEvm(null);
      }
    } else {
      if (index === 0) {
        setDrillLevel(null);
        setDrillProvince(null);
      }
    }
  };

  const handleDonutBack = () => {
    if (drillLevel === 'account') {
      handleBreadcrumbNav(1);
    } else if (drillLevel === 'evm' || drillGroup) {
      handleBreadcrumbNav(0);
    }
  };

  const drillLevelLabel = () => {
    if (isServiceDim) {
      const level = detail?.drillLevel;
      if (level === 'evm') return 'EVM Service';
      if (level === 'account') return 'รายการบัญชี';
      return 'กลุ่มธุรกิจ';
    }
    return detail?.drillLevel === 'postcode' ? 'ที่ทำการ' : 'จังหวัด';
  };

  const handleYearChange = (newYear) => {
    setYearBE(newYear);
    setMonthFrom('1'); // มกราคมเสมอ
    const latestM = meta?.latestMonthByYearBE?.[newYear] || 12;
    setMonthTo(String(latestM)); // เดือนล่าสุดที่มีข้อมูลเสมอ
  };

  const resetAllFilters = () => {
    const latestY = meta?.yearsBE?.length ? String(meta.yearsBE.at(-1)) : '2569';
    setYearBE(latestY);
    setMonthFrom('1');
    const latestM = meta?.latestMonthByYearBE?.[latestY] || 6;
    setMonthTo(String(latestM));
    setProvince('');
    setPostcode('');
    setSelectedSources(DEFAULT_SOURCES);
    setFilterGroup('');
    setFilterEvm('');
    setFilterAccount('');
    setPreviousFilterState(null);
  };

  const defaultLatestMonth = meta?.latestMonthByYearBE?.[yearBE] ? String(meta.latestMonthByYearBE[yearBE]) : '6';
  const hasActiveFilters = Boolean(
    monthFrom !== '1' ||
    monthTo !== defaultLatestMonth ||
    province ||
    postcode ||
    (mode === 'SAP' && (selectedSources.length < DEFAULT_SOURCES.length || filterGroup || filterEvm || filterAccount))
  );

  const modeLabel = mode === 'BI' ? 'BI' : 'SAP';
  const modeIcon = mode === 'BI' ? '📊' : '🏢';

  /* ── AI Insights Algorithmic Summary Generator ── */
  const aiInsights = useMemo(() => {
    if (!detail) return null;

    const catLabel = category === 'REVENUE' ? 'รายได้' : 'ค่าใช้จ่าย';
    const actual = detail.actual || 0;
    const target = detail.targetAmount || 0;
    const lastYear = detail.lastYearAmount || 0;
    const targetPct = detail.targetAchievementPct;
    const yoyPct = detail.yoyGrowthPct;

    // Time text
    let timeText = `ปี พ.ศ. ${yearBE}`;
    if (monthFrom && monthTo) {
      timeText += ` (${THAI_MONTHS.find((m) => m.value === Number(monthFrom))?.name || monthFrom} – ${THAI_MONTHS.find((m) => m.value === Number(monthTo))?.name || monthTo})`;
    } else if (monthFrom) {
      timeText += ` (ตั้งแต่ ${THAI_MONTHS.find((m) => m.value === Number(monthFrom))?.name || monthFrom})`;
    } else if (monthTo) {
      timeText += ` (ถึง ${THAI_MONTHS.find((m) => m.value === Number(monthTo))?.name || monthTo})`;
    } else {
      timeText += ` (สะสมทั้งปี)`;
    }

    // Location text
    let locText = 'สังกัด ปณข.6';
    if (postcode) {
      const off = availablePostcodes.find((p) => p.postcode === postcode);
      locText = `ที่ทำการ ${postcode} (${off?.postname || ''})`;
    } else if (province) {
      locText = `จังหวัด${province}`;
    }

    // Top breakdown item
    const sortedBreakdown = [...(detail.breakdown || [])].filter((r) => r.actual > 0).sort((a, b) => b.actual - a.actual);
    const topItem = sortedBreakdown[0];

    // Watchlist count (Orange & Red groups)
    const alertOffices = (watchlistData || []).filter((w) => {
      const compVal = watchCompareMode === 'target' ? w.targetAchievementPct : w.yoyGrowthPct;
      const st = getEvaluationStatus(compVal, category);
      return st.level === 'watch' || st.level === 'urgent';
    });

    const urgentOffices = (watchlistData || []).filter((w) => {
      const compVal = watchCompareMode === 'target' ? w.targetAchievementPct : w.yoyGrowthPct;
      const st = getEvaluationStatus(compVal, category);
      return st.level === 'urgent';
    });

    const status = getEvaluationStatus(targetPct, category);
    const points = [];

    // Overview Point
    if (target > 0) {
      const diff = actual - target;
      if (diff >= 0) {
        points.push(`🎉 ผลงานจริง ${catLabel} ทำได้ **${money(actual)} บาท** เกินเป้าหมาย **+${money(diff)} บาท** คิดเป็น **${pct(targetPct)}** ของเป้า`);
      } else {
        points.push(`⚠️ ผลงานจริง ${catLabel} ทำได้ **${money(actual)} บาท** ยังขาดอีก **${money(Math.abs(diff))} บาท** เพื่อให้บรรลุเป้าหมาย (คิดเป็น **${pct(targetPct)}**)`);
      }
    } else {
      points.push(`📊 ผลงานจริง ${catLabel} รวม **${money(actual)} บาท**`);
    }

    // YoY Point
    if (lastYear > 0) {
      const yoyDiff = actual - lastYear;
      if (yoyDiff >= 0) {
        points.push(`📈 มีการเติบโต **+${pct(yoyPct)}** (เพิ่มขึ้น ${money(yoyDiff)} บาท) เมื่อเทียบกับช่วงเดียวกันของปีก่อน (${money(lastYear)} บาท)`);
      } else {
        points.push(`📉 ชะลอตัวลง **${pct(yoyPct)}** (ลดลง ${money(Math.abs(yoyDiff))} บาท) เมื่อเทียบกับปีก่อนหน้า (${money(lastYear)} บาท)`);
      }
    }

    // Top Performer
    if (topItem) {
      points.push(`🏆 ตัวขับเคลื่อนหลักในมุมมองปัจจุบันคือ **"${topItem.name}"** ทำได้ **${money(topItem.actual)} บาท** (${pct(topItem.achievementPct)} เทียบเป้า)`);
    }

    // Alert Point
    if (alertOffices.length > 0) {
      points.push(`🚨 ตรวจพบ **${alertOffices.length} ที่ทำการ** ในกลุ่มเฝ้าระวังและติดตามเร่งด่วน (กลุ่มสีแดงวิกฤติ **${urgentOffices.length} แห่ง**)`);
    }

    return {
      timeText,
      locText,
      catLabel,
      status,
      points,
      alertCount: alertOffices.length,
      urgentCount: urgentOffices.length,
    };
  }, [detail, watchlistData, watchCompareMode, category, yearBE, monthFrom, monthTo, province, postcode, availablePostcodes]);

  /* ── Filtered Watchlist List (Only Orange & Red) ── */
  const filteredWatchlist = useMemo(() => {
    return (watchlistData || [])
      .filter((item) => {
        const compVal = watchCompareMode === 'target' ? item.targetAchievementPct : item.yoyGrowthPct;
        const status = getEvaluationStatus(compVal, category);
        const isOrangeOrRed = status.level === 'watch' || status.level === 'urgent';
        if (!isOrangeOrRed) return false;

        if (watchSearch) {
          const s = watchSearch.toLowerCase();
          const matchSearch = item.postcode.includes(s) || item.postname.toLowerCase().includes(s) || item.province.toLowerCase().includes(s);
          return matchSearch;
        }
        return true;
      })
      .sort((a, b) => {
        const valA = watchCompareMode === 'target' ? (a.targetAchievementPct || 0) : (a.yoyGrowthPct || 0);
        const valB = watchCompareMode === 'target' ? (b.targetAchievementPct || 0) : (b.yoyGrowthPct || 0);
        return valA - valB;
      });
  }, [watchlistData, watchCompareMode, watchSearch, category]);

  return (
    <main>
      <header>
        <div>
          <h1>{modeIcon} Dashboard ผลการดำเนินงาน ปณข.6 <span className="mode-badge">{modeLabel}</span></h1>
          <p>
            {mode === 'BI' ? 'ข้อมูล BI รายได้และค่าใช้จ่ายระดับภาพรวมและที่ทำการ' : 'ข้อมูลรวม SAP + COD + FUZE + LOTTO + e-Commerce + DIT พร้อมเจาะลึกหลายมิติ'}
            <span className="data-note">{meta?.filesLoaded || 0} ไฟล์</span>
          </p>
        </div>
        <div className="mode-toggle">
          <button className={mode === 'BI' ? 'active' : ''} onClick={() => setMode('BI')}>📊 โหมด BI</button>
          <button className={mode === 'SAP' ? 'active' : ''} onClick={() => setMode('SAP')}>🏢 โหมด SAP</button>
        </div>
      </header>

      {/* Summary KPI Cards (Overall System Total - Decoupled from sub-filters) */}
      <div className="summary">
        {summary && (
          <>
            <Card
              label="รายได้รวมทั้งระบบ"
              value={summary.totalRevenue}
              detail={`เป้าหมายทั้งปี: ${money(summary.revenueTargetAmount)} (${pct(summary.revenueAchievementPct)})`}
              tone="up"
            />
            <Card
              label="ค่าใช้จ่ายรวมทั้งระบบ"
              value={summary.totalExpense}
              detail={`เป้าหมายทั้งปี: ${money(summary.expenseTargetAmount)} (${pct(summary.expenseAchievementPct)})`}
              tone="down"
            />
            <Card
              label="กำไร / ขาดทุนสุทธิทั้งระบบ"
              value={summary.netProfit}
              detail="ภาพรวมทั้งระบบ (คงที่ตามปี พ.ศ.)"
              tone={summary.netProfit >= 0 ? 'up' : 'down'}
            />
          </>
        )}
      </div>

      {/* Filter Control Box */}
      <section className="filter-box panel">
        <div className="filter-header">
          <div className="filter-title">
            <strong>🔍 ตัวกรองข้อมูล (Filters)</strong>
            {hasActiveFilters && <span className="filter-active-pill">มีตัวกรองทำงานอยู่</span>}
          </div>
          {hasActiveFilters && (
            <button className="filter-reset-btn" onClick={resetAllFilters}>
              ↺ ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>

        {/* Row 1: Category, Year, Month Range, Province, Postcode */}
        <div className="filters-grid">
          <div className="filter-field">
            <label>ประเภท</label>
            <div className="toggle">
              <button className={category === 'REVENUE' ? 'active' : ''} onClick={() => handleCategoryChange('REVENUE')}>
                รายได้
              </button>
              <button className={category === 'EXPENSE' ? 'active' : ''} onClick={() => handleCategoryChange('EXPENSE')}>
                ค่าใช้จ่าย
              </button>
            </div>
          </div>

          <div className="filter-field">
            <label>ปี พ.ศ.</label>
            <select value={yearBE} onChange={(e) => handleYearChange(e.target.value)}>
              {meta?.yearsBE?.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>

          <div className="filter-field month-range-field">
            <label>ช่วงเดือน (จาก - ถึง)</label>
            <div className="month-range-selects">
              <select value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)}>
                {THAI_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>{m.name}</option>
                ))}
              </select>
              <span className="range-dash">-</span>
              <select value={monthTo} onChange={(e) => setMonthTo(e.target.value)}>
                {THAI_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="filter-field">
            <label>จังหวัด</label>
            <select value={province} onChange={(e) => handleProvinceChange(e.target.value)}>
              <option value="">ทุกจังหวัด (ทั้งหมด)</option>
              {meta?.provinces?.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>

          <div className="filter-field">
            <label>ที่ทำการ {province ? `(${province})` : ''}</label>
            <select value={postcode} onChange={(e) => setPostcode(e.target.value)}>
              <option value="">ทุกที่ทำการ (ทั้งหมด)</option>
              {availablePostcodes.map((item) => (
                <option key={item.postcode} value={item.postcode}>
                  {item.postcode} - {item.postname}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* SAP Mode Specific Filters */}
        {mode === 'SAP' && (
          <div className="sap-filters-container">
            <div className="source-checkbox-group">
              <div className="source-checkbox-header">
                <label>แหล่งข้อมูล (เลือก/หักออก แล้วคำนวณ Target อัตโนมัติ):</label>
                {selectedSources.length < DEFAULT_SOURCES.length && (
                  <button className="select-all-btn" onClick={selectAllSources}>เลือกทั้งหมด</button>
                )}
              </div>
              <div className="checkboxes-row">
                {DEFAULT_SOURCES.map((src) => {
                  const checked = selectedSources.includes(src);
                  return (
                    <label key={src} className={`checkbox-item ${checked ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSource(src)}
                      />
                      <span>{SOURCE_LABELS[src]}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="service-filters-row">
              <div className="filter-field flex-1">
                <label>กลุ่มธุรกิจ ({category === 'REVENUE' ? 'รายได้' : 'ค่าใช้จ่าย'})</label>
                <select value={filterGroup} onChange={(e) => handleGroupFilterChange(e.target.value)}>
                  <option value="">ทุกกลุ่มธุรกิจ (ทั้งหมด)</option>
                  {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div className="filter-field flex-1">
                <label>EVM Service</label>
                <select
                  value={filterEvm}
                  onChange={(e) => handleEvmFilterChange(e.target.value)}
                  disabled={!filterGroup}
                >
                  <option value="">{filterGroup ? 'ทุก EVM Service (ทั้งหมด)' : '— กรุณาเลือกกลุ่มธุรกิจก่อน —'}</option>
                  {evmOptions.map((evm) => <option key={evm} value={evm}>{evm}</option>)}
                </select>
              </div>

              <div className="filter-field flex-1">
                <label>รายการบัญชี (Account)</label>
                <select
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  disabled={!filterEvm}
                >
                  <option value="">{filterEvm ? 'ทุกรายการบัญชี (ทั้งหมด)' : '— กรุณาเลือก EVM Service ก่อน —'}</option>
                  {accountOptions.map((acc) => (
                    <option key={acc.accountcode} value={acc.accountcode}>
                      {acc.accountcode} - {acc.accountname}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── AI Insights Component (Enterprise Slate Theme) ── */}
      {aiInsights && (
        <section className="panel ai-insights-panel">
          <div className="ai-insights-header">
            <div className="ai-title-wrap">
              <span className="ai-sparkle-icon">✨</span>
              <div>
                <h2>AI Insight สรุปผลการดำเนินงาน</h2>
                <p className="ai-subtitle">
                  สรุปมุมมอง: <strong>{aiInsights.locText}</strong> | <strong>{aiInsights.timeText}</strong>
                </p>
              </div>
            </div>
            <div className="ai-status-tag">
              <span className="status-dot" style={{ backgroundColor: aiInsights.status.dotColor }}></span>
              <span>สถานะ: <strong>{aiInsights.status.label.split(' (')[0]}</strong></span>
            </div>
          </div>
          <div className="ai-insights-content">
            <ul className="ai-bullet-list">
              {aiInsights.points.map((point, index) => (
                <li key={index} dangerouslySetInnerHTML={{
                  __html: point.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                }} />
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Collapsible Performance Evaluation Criteria (Color Indicators) ── */}
      <section className="panel criteria-panel">
        <div className="criteria-header" onClick={() => setShowIndicators(!showIndicators)}>
          <div className="criteria-title">
            <span className="criteria-icon">🎯</span>
            <strong>เกณฑ์การประเมินผลงาน (Color Indicators)</strong>
          </div>
          <button className="criteria-toggle-btn" aria-label="Toggle criteria">
            {showIndicators ? '▲ ซ่อนเกณฑ์' : '▼ แสดงเกณฑ์'}
          </button>
        </div>
        {showIndicators && (
          <div className="criteria-grid">
            <div className="criteria-col revenue-criteria">
              <h4 className="criteria-col-header">📈 กลุ่มรายได้ (Revenue Target)</h4>
              <ul className="criteria-list">
                <li><span className="color-dot dot-emerald"></span> <strong>ยอดเยี่ยม</strong> (≥ 110%)</li>
                <li><span className="color-dot dot-green"></span> <strong>ดีมาก</strong> (100% – 109.9%)</li>
                <li><span className="color-dot dot-yellow"></span> <strong>กลุ่มเสริมทัพเร่งบูรณาการ</strong> (90% – 99.9%)</li>
                <li><span className="color-dot dot-orange"></span> <strong>เฝ้าระวัง ติดตามอย่างใกล้ชิด</strong> (70% – 89.9%)</li>
                <li><span className="color-dot dot-red"></span> <strong>ติดตามเร่งด่วน</strong> (&lt; 70%)</li>
              </ul>
            </div>

            <div className="criteria-col expense-criteria">
              <h4 className="criteria-col-header">📉 กลุ่มค่าใช้จ่าย (Expense Budget)</h4>
              <ul className="criteria-list">
                <li><span className="color-dot dot-emerald"></span> <strong>บริหารได้ดีเยี่ยม</strong> (≤ 70%)</li>
                <li><span className="color-dot dot-green"></span> <strong>ควบคุมได้รัดกุม</strong> (70.1% – 90%)</li>
                <li><span className="color-dot dot-yellow"></span> <strong>กลุ่มเสริมทัพเร่งบูรณาการ</strong> (90.1% – 100%)</li>
                <li><span className="color-dot dot-orange"></span> <strong>เฝ้าระวัง ติดตามอย่างใกล้ชิด</strong> (100.1% – 110%)</li>
                <li><span className="color-dot dot-red"></span> <strong>ใช้จ่ายเกินงบประมาณ</strong> (&gt; 110%)</li>
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* ── Semi-Circle Gauge Bar for Filtered Detail Performance ── */}
      {detail && (
        <section className="panel gauge-section-panel">
          <div className="section-title-wrap">
            <h2>
              {category === 'REVENUE' ? '📈 ภาพรวมผลการดำเนินงานด้านรายได้' : '📉 ภาพรวมผลการดำเนินงานด้านค่าใช้จ่าย'}
              {province && <span className="sub-title"> : {province}</span>}
              {postcode && <span className="sub-title"> › {postcode}</span>}
              {filterGroup && <span className="sub-title"> : {filterGroup}</span>}
            </h2>
            <p className="hint-text">มาตรวัดความสำเร็จของผลงานจริงเทียบเป้าหมายและปีก่อนหน้าตามตัวกรองที่เลือก</p>
          </div>
          <GaugeBar
            actual={detail.actual}
            target={detail.targetAmount}
            lastYear={detail.lastYearAmount}
            yoyGrowthPct={detail.yoyGrowthPct}
            category={category}
          />
        </section>
      )}

      {/* ── SAP Mode File Summary ── */}
      {mode === 'SAP' && detail?.sourceSummary && (
        <section className="panel file-summary-panel">
              <div className="file-summary-header">
                <div>
                  <h2>📁 สรุปผลการดำเนินงานแยกตามไฟล์แหล่งข้อมูล ({category === 'REVENUE' ? 'รายได้' : 'ค่าใช้จ่าย'})</h2>
                  <p className="hint-text">เปรียบเทียบผลงานจริง เป้าหมาย และปีก่อนหน้าของแต่ละไฟล์แหล่งข้อมูล</p>
                </div>
              </div>
              <div className="table-responsive">
                <table className="file-summary-table">
                  <thead>
                    <tr>
                      <th>ไฟล์ / แหล่งข้อมูล</th>
                      <th>สถานะ</th>
                      <th className="num">ผลงานจริง (บาท)</th>
                      <th className="num">เป้าหมาย (บาท)</th>
                      <th className="num">% บรรลุเป้า</th>
                      <th className="num">ปีก่อนหน้า (บาท)</th>
                      <th className="num">% YoY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.sourceSummary.map((item) => (
                      <tr key={item.source} className={!item.enabled ? 'disabled-row' : ''}>
                        <td>
                          <strong className="source-name-badge">📁 {item.label}</strong>
                        </td>
                        <td>
                          <span className={`status-pill ${item.enabled ? 'active' : 'inactive'}`}>
                            {item.enabled ? '✓ รวมในการคำนวณ' : '✕ ไม่รวม'}
                          </span>
                        </td>
                        <td className="num">{money(item.actual)}</td>
                        <td className="num">{money(item.target)}</td>
                        <td className="num">
                          <span className={`pct-badge ${item.achievementPct >= 100 ? 'good' : ''}`}>
                            {pct(item.achievementPct)}
                          </span>
                        </td>
                        <td className="num">{money(item.lastYearAmount)}</td>
                        <td className="num">{pct(item.yoyGrowthPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}><strong>รวมแหล่งข้อมูลที่เลือก</strong></td>
                      <td className="num">
                        <strong>
                          {money(detail.sourceSummary.filter((s) => s.enabled).reduce((acc, s) => acc + (s.actual || 0), 0))}
                        </strong>
                      </td>
                      <td className="num">
                        <strong>
                          {money(detail.sourceSummary.filter((s) => s.enabled).reduce((acc, s) => acc + (s.target || 0), 0))}
                        </strong>
                      </td>
                      <td className="num">
                        <strong className="pct-badge">
                          {pct(
                            detail.sourceSummary.filter((s) => s.enabled).reduce((acc, s) => acc + (s.target || 0), 0)
                              ? (detail.sourceSummary.filter((s) => s.enabled).reduce((acc, s) => acc + (s.actual || 0), 0) /
                                  detail.sourceSummary.filter((s) => s.enabled).reduce((acc, s) => acc + (s.target || 0), 0)) *
                                  100
                              : null
                          )}
                        </strong>
                      </td>
                      <td className="num">
                        <strong>
                          {money(detail.sourceSummary.filter((s) => s.enabled).reduce((acc, s) => acc + (s.lastYearAmount || 0), 0))}
                        </strong>
                      </td>
                      <td className="num">
                        <strong className="pct-badge">
                          {pct(
                            detail.sourceSummary.filter((s) => s.enabled).reduce((acc, s) => acc + (s.lastYearAmount || 0), 0)
                              ? (detail.sourceSummary.filter((s) => s.enabled).reduce((acc, s) => acc + (s.actual || 0), 0) /
                                  detail.sourceSummary.filter((s) => s.enabled).reduce((acc, s) => acc + (s.lastYearAmount || 0), 0)) *
                                  100
                              : null
                          )}
                        </strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

      {/* Monthly Trend Chart */}
      <section className="panel chart">
        <h2>📊 แนวโน้มรายเดือนเทียบเป้าหมาย ({category === 'REVENUE' ? 'รายได้' : 'ค่าใช้จ่าย'})</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trend} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="monthName" />
            <YAxis tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : v)} />
            <Tooltip formatter={(v) => [`${money(v)} บาท`]} />
            <Legend verticalAlign="top" height={36} />
            <Bar dataKey="currentAmount" name="ปีปัจจุบัน (Actual)" fill="#2DBDB6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="lastYearAmount" name="ปีก่อนหน้า" fill="#A0AEC0" radius={[4, 4, 0, 0]} />
            <Bar dataKey="targetAmount" name="เป้าหมาย (Target)" fill="#F0B90B" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Drill-down Table */}
      <section className="panel">
        <div className="drill-header">
          <div>
            <div className="table-title-row">
              <h2>📋 รายละเอียดตาม{drillLevelLabel()} ({category === 'REVENUE' ? 'รายได้' : 'ค่าใช้จ่าย'})</h2>
              {mode === 'SAP' && (
                <div className="dimension-toggle">
                  <button
                    className={dimension === 'service' ? 'active' : ''}
                    onClick={() => setDimension('service')}
                  >
                    🏢 กลุ่มบริการ (Service)
                  </button>
                  <button
                    className={dimension === 'area' ? 'active' : ''}
                    onClick={() => setDimension('area')}
                  >
                    📍 รายจังหวัด/ที่ทำการ (Area)
                  </button>
                </div>
              )}
            </div>
            <p className="hint-text">
              {canDrill ? '💡 สามารถคลิกที่แถวเพื่อเจาะลึกดูรายละเอียดระดับถัดไป' : 'ระดับรายการละเอียดสุดแล้ว'}
            </p>
          </div>
          <div className="table-header-controls">
            <div className="mini-toggle-group">
              <button
                className={tableCompareMode === 'target' ? 'active' : ''}
                onClick={() => setTableCompareMode('target')}
                title="เปรียบเทียบผลงานจริงเทียบเป้าหมาย"
              >
                🎯 เทียบเป้าหมาย
              </button>
              <button
                className={tableCompareMode === 'yoy' ? 'active' : ''}
                onClick={() => setTableCompareMode('yoy')}
                title="เปรียบเทียบผลงานจริงเทียบปีก่อนหน้า (YoY)"
              >
                📅 เทียบปีก่อน (YoY)
              </button>
            </div>
            <Breadcrumb items={breadcrumbItems} onNavigate={handleBreadcrumbNav} />
          </div>
        </div>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>{drillLevelLabel()}</th>
                <th className="num">ผลงานจริง (บาท)</th>
                <th className="num">{tableCompareMode === 'target' ? 'เป้าหมาย (บาท)' : 'ปีก่อนหน้า (บาท)'}</th>
                <th className="num">{tableCompareMode === 'target' ? '% บรรลุเป้า' : '% YoY'}</th>
                {canDrill && <th className="center">เจาะลึก</th>}
              </tr>
            </thead>
            <tbody>
              {detail?.breakdown?.length === 0 ? (
                <tr>
                  <td colSpan={canDrill ? 5 : 4} className="empty-row">
                    ไม่พบข้อมูลตามเงื่อนไขตัวกรองที่เลือก
                  </td>
                </tr>
              ) : (
                detail?.breakdown?.map((row) => {
                  const compVal = tableCompareMode === 'target' ? row.target : row.lastYearAmount;
                  const compPct = tableCompareMode === 'target' ? row.achievementPct : row.yoyGrowthPct;
                  const evalStatus = getEvaluationStatus(compPct, category);

                  return (
                    <tr
                      key={row.name}
                      className={canDrill ? 'drill-row' : ''}
                      onClick={() => canDrill && handleDrill(row)}
                    >
                      <td>
                        <span className="row-name">{row.name}</span>
                      </td>
                      <td className="num">{money(row.actual)}</td>
                      <td className="num">{money(compVal)}</td>
                      <td className="num">
                        <span className={`pct-badge ${evalStatus.badgeClass}`}>
                          {pct(compPct)}
                        </span>
                      </td>
                      {canDrill && <td className="drill-arrow center">▶</td>}
                    </tr>
                  );
                })
              )}
            </tbody>
            {detail?.breakdown && detail.breakdown.length > 0 && (
              <tfoot>
                <tr>
                  <td><strong>รวมทั้งหมด</strong></td>
                  <td className="num">
                    <strong>{money(detail.breakdown.reduce((s, r) => s + (r.actual || 0), 0))}</strong>
                  </td>
                  <td className="num">
                    <strong>
                      {money(
                        detail.breakdown.reduce(
                          (s, r) => s + (tableCompareMode === 'target' ? (r.target || 0) : (r.lastYearAmount || 0)),
                          0
                        )
                      )}
                    </strong>
                  </td>
                  <td className="num">
                    <strong className="pct-badge">
                      {(() => {
                        const totalAct = detail.breakdown.reduce((s, r) => s + (r.actual || 0), 0);
                        const totalCmp = detail.breakdown.reduce(
                          (s, r) => s + (tableCompareMode === 'target' ? (r.target || 0) : (r.lastYearAmount || 0)),
                          0
                        );
                        return pct(totalCmp > 0 ? (totalAct / totalCmp) * 100 : null);
                      })()}
                    </strong>
                  </td>
                  {canDrill && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* ── Visualizations Zone (Bottom) ── */}
      {mode === 'SAP' && isServiceDim && detail?.breakdown ? (
        <div className="bottom-visuals-grid">
          <Region6Map
            watchlistData={watchlistData}
            category={category}
            selectedProvince={province}
            selectedPostcode={postcode}
            onSelectLocation={handleMapSelectLocation}
          />
          <SapDonutChart
            breakdown={detail.breakdown}
            drillLevel={detail.drillLevel}
            onDrill={handleDrill}
            onBack={handleDonutBack}
            breadcrumbItems={breadcrumbItems}
            onBreadcrumbNav={handleBreadcrumbNav}
            category={category}
          />
        </div>
      ) : (
        <Region6Map
          watchlistData={watchlistData}
          category={category}
          selectedProvince={province}
          selectedPostcode={postcode}
          onSelectLocation={handleMapSelectLocation}
        />
      )}

      {/* ── Compact & Hideable Floating Watchlist Widget ── */}
      {!isWatchlistHidden ? (
        <div className="floating-watchlist-wrapper">
          {!isWatchlistOpen ? (
            <div className="floating-bubble-group">
              <button
                className="floating-watchlist-btn compact"
                onClick={() => setIsWatchlistOpen(true)}
                title="คลิกเพื่อเปิดดูที่ทำการเฝ้าระวัง"
              >
                <span className="watch-btn-icon">🚨</span>
                <span className="watch-btn-text">เฝ้าระวัง</span>
                <span className="watch-btn-badge">{filteredWatchlist.length}</span>
              </button>
              <button
                className="floating-hide-trigger-btn"
                onClick={() => setIsWatchlistHidden(true)}
                title="ซ่อนปุ่มเฝ้าระวัง"
              >
                👁️‍🗨️ ซ่อน
              </button>
            </div>
          ) : (
            <div className="floating-watchlist-card compact">
              <div className="floating-watch-header">
                <div className="floating-watch-title">
                  <span className="watch-card-icon">🚨</span>
                  <div>
                    <strong>ที่ทำการเฝ้าระวัง (ส้ม/แดง)</strong>
                    <span className="watch-count-pill">{filteredWatchlist.length} แห่ง</span>
                  </div>
                </div>
                <div className="floating-watch-actions">
                  <div className="mini-watch-toggle">
                    <button
                      className={watchCompareMode === 'target' ? 'active' : ''}
                      onClick={() => setWatchCompareMode('target')}
                      title="เทียบเป้าหมาย (ส้ม/แดง)"
                    >
                      เป้า
                    </button>
                    <button
                      className={watchCompareMode === 'yoy' ? 'active' : ''}
                      onClick={() => setWatchCompareMode('yoy')}
                      title="เทียบปีก่อน YoY (ส้ม/แดง)"
                    >
                      YoY
                    </button>
                  </div>
                  <button
                    className="floating-watch-close-btn"
                    onClick={() => setIsWatchlistOpen(false)}
                    title="ย่อเก็บ"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Mini Search */}
              <div className="mini-watch-search">
                <input
                  type="text"
                  placeholder="🔍 ค้นหาที่ทำการ..."
                  value={watchSearch}
                  onChange={(e) => setWatchSearch(e.target.value)}
                />
                {watchSearch && (
                  <button className="clear-search-btn" onClick={() => setWatchSearch('')}>✕</button>
                )}
              </div>

              {/* Scrollable Mini List */}
              <div className="mini-watch-list compact">
                {filteredWatchlist.length === 0 ? (
                  <div className="mini-watch-empty">
                    🎉 ไม่พบที่ทำการในกลุ่มเฝ้าระวัง/เร่งด่วน
                  </div>
                ) : (
                  filteredWatchlist.map((item) => {
                    const compVal = watchCompareMode === 'target' ? item.targetAchievementPct : item.yoyGrowthPct;
                    const status = getEvaluationStatus(compVal, category);
                    const isSelected = postcode === item.postcode;

                    return (
                      <button
                        key={item.postcode}
                        className={`mini-watch-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectWatchOffice(item)}
                        title={`คลิกเพื่อกรองข้อมูลเฉพาะ ${item.postname} (${item.postcode})`}
                      >
                        <div className="mini-item-left">
                          <span className="mini-item-dot" style={{ backgroundColor: status.dotColor }}></span>
                          <div className="mini-item-info">
                            <span className="mini-item-name">{item.postname}</span>
                            <span className="mini-item-prov">{item.province} ({item.postcode})</span>
                          </div>
                        </div>
                        <div className="mini-item-right">
                          <span className="mini-item-pct" style={{ color: status.dotColor }}>
                            {pct(compVal)}
                          </span>
                          {isSelected && <span className="mini-selected-check">✓</span>}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="mini-watch-footer">
                <small>💡 คลิกที่ชื่อที่ทำการเพื่อ Filter ทันที</small>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          className="floating-show-btn"
          onClick={() => setIsWatchlistHidden(false)}
          title="แสดงกล่องที่ทำการเฝ้าระวัง"
        >
          🚨 แสดงเฝ้าระวัง ({filteredWatchlist.length})
        </button>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);

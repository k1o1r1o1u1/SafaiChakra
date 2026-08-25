import { Fuel, Clock, Leaf, TrendingDown, ArrowRight, Gauge } from "lucide-react";
import { useMemo } from "react";

/** Litres per 100 km — municipal refuse truck, loaded urban cycle (~3.5 km/L). */
const L_PER_100KM = 28;
const L_PER_KM = L_PER_100KM / 100;
const DIESEL_PRICE_PER_L = 93;
const CO2_KG_PER_L_DIESEL = 2.68;
/** Average driving speed for dense urban collection (km/h). */
const AVG_SPEED_KMH = 28;
/** Minutes per bin (service + maneuver). */
const DWELL_MIN_PER_STOP = 3.5;

function calcSavings(routeData) {
  if (!routeData || !routeData.route || routeData.route.length < 2) return null;

  const optimized_km = routeData.optimized_distance_km ?? 0;
  const baseline_km = routeData.baseline_distance_km;
  const haversineRefKm = routeData.unoptimized_distance_km ?? 0;

  const hasFairBaseline = typeof baseline_km === "number" && baseline_km > 0;
  const comparisonBaseKm = hasFairBaseline ? baseline_km : Math.max(optimized_km, 1e-6);
  const saved_km = Math.max(0, comparisonBaseKm - optimized_km);

  const eff_unopt = comparisonBaseKm;
  const eff_opt = optimized_km;
  const eff_saved = saved_km;

  const fuelSaved = eff_saved * L_PER_KM;
  const co2Saved = fuelSaved * CO2_KG_PER_L_DIESEL;
  const costSaved = fuelSaved * DIESEL_PRICE_PER_L;

  const stops = routeData.route.filter((b) => b !== "DEPOT_00").length;
  const driveMinOpt = (eff_opt / AVG_SPEED_KMH) * 60;
  const tripMin = Math.round(driveMinOpt + stops * DWELL_MIN_PER_STOP);
  const driveMinSaved = (eff_saved / AVG_SPEED_KMH) * 60;

  const pct = eff_unopt > 0 ? (eff_saved / eff_unopt) * 100 : 0;

  return {
    stops,
    totalCityBins: routeData.total_city_bins ?? routeData.route.length,
    eff_saved: eff_saved.toFixed(2),
    eff_opt: eff_opt.toFixed(2),
    eff_unopt: eff_unopt.toFixed(2),
    fuelSaved: fuelSaved.toFixed(1),
    co2Saved: co2Saved.toFixed(1),
    costSaved: Math.round(costSaved),
    tripMin,
    driveMinSaved: Math.round(driveMinSaved),
    pct: pct.toFixed(1),
    hasFairBaseline,
    haversineRefKm: haversineRefKm.toFixed(1),
  };
}

function Metric({ icon: Icon, label, value, unit, color, delay = 0 }) {
  return (
    <div
      className="bg-[var(--color-bg)] border border-[var(--color-card-border)] rounded-xl px-3.5 py-2.5 flex items-center gap-3.5 slide-in shadow-sm hover:border-[var(--color-text-dim)]/30 transition-all"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-8 h-8 rounded-lg bg-[var(--color-surface)] border border-[var(--color-card-border)] flex items-center justify-center shrink-0">
        <Icon size={14} style={{ color: `var(${color})` }} />
      </div>
      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-[17px] font-black tracking-tight tabular-nums text-[var(--color-text)] leading-none">{value}</span>
          <span className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase">{unit}</span>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)] mt-1 leading-none">{label}</p>
      </div>
    </div>
  );
}

export default function SavingsCard({ routeData }) {
  const s = useMemo(() => calcSavings(routeData), [routeData]);

  if (!s) {
    return (
      <div className="glass-panel p-6 flex flex-row items-center justify-between border-2 border-dashed border-[var(--color-card-border)] bg-[var(--color-bg)]/50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-card-border)] flex items-center justify-center shadow-sm">
            <TrendingDown size={20} className="text-[var(--color-text-dim)]" />
          </div>
          <div>
            <p className="text-sm font-black text-[var(--color-text)] uppercase tracking-wider">Efficiency Analytics</p>
            <p className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase tracking-widest mt-1">
              Run <span className="text-[var(--color-green)]">Optimization</span> to sync data
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 opacity-20">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-24 h-8 rounded-lg bg-[var(--color-card-border)]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-3.5 sm:p-4 slide-in border-[var(--color-card-border)] relative overflow-hidden">
      {/* Background Accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-green)]/[0.02] blur-[60px] pointer-events-none" />

      {/* Header & Stats Row */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3.5 sm:gap-5 mb-3.5 relative z-10">
        <div className="flex items-center gap-3 min-w-[150px]">
          <div className="w-[34px] h-[34px] sm:w-[38px] sm:h-[38px] rounded-lg bg-[var(--color-bg)] border border-[var(--color-card-border)] flex items-center justify-center shadow-sm shrink-0">
            <TrendingDown size={16} className="text-[var(--color-green)]" />
          </div>
          <p className="text-[13.5px] sm:text-[15px] font-black text-[var(--color-text)] tracking-tight">Efficiency Savings</p>
        </div>

        <div className="flex-1 flex flex-col sm:grid sm:grid-cols-[1fr_auto_1fr_auto] items-stretch sm:items-center gap-2 sm:gap-0 bg-[var(--color-bg)] rounded-xl border border-[var(--color-card-border)] overflow-hidden p-2 sm:p-0">
          {/* Base Configuration */}
          <div className="flex flex-col px-3 py-1.5 sm:px-4 sm:py-2 border-b sm:border-b-0 sm:border-r border-[var(--color-card-border)] bg-[var(--color-bg)]/30 rounded-lg sm:rounded-none">
            <span className="text-[8.5px] sm:text-[9px] font-black text-[var(--color-text-dim)] uppercase tracking-[0.15em] mb-0.5">
              {s.hasFairBaseline ? "Static route" : "Base"}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[9.5px] font-bold text-[var(--color-text-muted)] uppercase">Base</span>
              <span className="text-[15px] sm:text-[17px] font-black tabular-nums text-[var(--color-text-muted)] leading-none">{s.eff_unopt}</span>
              <span className="text-[9.5px] font-bold text-[var(--color-text-muted)] lowercase">KM</span>
            </div>
          </div>

          <div className="hidden sm:flex px-2 items-center justify-center">
            <ArrowRight size={13} className="text-[var(--color-text-dim)]/40" />
          </div>

          {/* Optimized Configuration */}
          <div className="flex flex-col px-3 py-1.5 sm:px-4 sm:py-2 border-b sm:border-b-0 sm:border-l border-[var(--color-card-border)] bg-[var(--color-green)]/[0.03] rounded-lg sm:rounded-none">
            <span className="text-[8.5px] sm:text-[9px] font-black text-[var(--color-green)] uppercase tracking-[0.15em] mb-0.5">OR-Tools</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[9.5px] font-bold text-[var(--color-green)] uppercase">Opt</span>
              <span className="text-[15px] sm:text-[17px] font-black tabular-nums text-[var(--color-text)] leading-none">{s.eff_opt}</span>
              <span className="text-[9.5px] font-bold text-[var(--color-text-dim)] lowercase">km</span>
            </div>
          </div>

          {/* Financial Dividend */}
          <div className="bg-[var(--color-surface)] sm:border-l border-[var(--color-card-border)] px-3 py-2 sm:px-5 sm:py-2.5 flex items-center justify-between sm:flex-col sm:justify-center sm:items-end rounded-lg sm:rounded-none">
            <span className="text-[8.5px] sm:text-[9px] font-black text-[var(--color-green)] uppercase tracking-[0.15em]">Dividend</span>
            <span className="text-[14px] sm:text-[17px] font-black text-[var(--color-green)] tracking-tighter leading-none shadow-[0_0_15px_rgba(14,126,42,0.1)]">₹{s.costSaved} Saved</span>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 mb-3.5 relative z-10">
        <Metric icon={Clock} label="Est. trip" value={s.tripMin} unit="mins" color="--color-cyan" delay={0} />
        <Metric icon={Gauge} label="Drive time saved" value={s.driveMinSaved} unit="mins" color="--color-purple" delay={60} />
        <Metric icon={Fuel} label="Fuel saved" value={s.fuelSaved} unit="L" color="--color-amber" delay={120} />
        <Metric icon={Leaf} label="CO₂ avoided" value={s.co2Saved} unit="kg" color="--color-green" delay={180} />
      </div>

      {/* Global Efficiency Belt */}
      <div className="bg-[var(--color-bg)] px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl border border-[var(--color-card-border)] flex flex-col md:flex-row md:items-center gap-2 sm:gap-3 shadow-inner">
        <div className="flex items-center gap-3 sm:gap-6 flex-1">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="text-[15px] sm:text-[18px] font-black text-[var(--color-green)] tabular-nums">{s.pct}%</span>
            <span className="text-[8.5px] sm:text-[10px] font-black text-[var(--color-text-dim)] uppercase tracking-widest leading-tight">Route distance<br className="hidden sm:inline" /> saved</span>
          </div>
          <div className="flex-1 h-2 sm:h-2.5 bg-[var(--color-surface)] rounded-full overflow-hidden border border-[var(--color-card-border)] min-w-0">
            <div
              className="h-full bg-[var(--color-green)] opacity-80 shadow-[0_0_10px_var(--color-green)] transition-all duration-1000 ease-out"
              style={{ width: `${Math.min(100, parseFloat(s.pct))}%` }}
            />
          </div>
          <div className="flex items-baseline gap-1 text-[8.5px] sm:text-[9px] font-bold text-[var(--color-text-dim)] uppercase tracking-tighter tabular-nums shrink-0">
            <TrendingDown size={11} className="text-[var(--color-purple)] opacity-80" />
            <span className="text-[var(--color-text)]">{s.eff_saved}</span>
            <span>km</span>
          </div>
        </div>
        <p className="text-[7.5px] sm:text-[8px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide leading-relaxed border-t md:border-t-0 md:border-l border-[var(--color-card-border)] pt-1.5 md:pt-0 md:pl-3 md:max-w-[240px]">
          Base = fixed loop. Savings vs static schedule. Straight-line ref ≈ {s.haversineRefKm} km.
        </p>
      </div>
    </div>
  );
}

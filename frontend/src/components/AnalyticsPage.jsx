import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Fuel, Leaf, IndianRupee, TrendingDown, BarChart2, Zap } from "lucide-react";

/* ── Constants (mirror SavingsCard) ── */
const L_PER_100KM = 28;
const L_PER_KM = L_PER_100KM / 100;
const DIESEL_PRICE = 93;   // ₹ per litre
const CO2_KG_PER_L = 2.68;

/* ── Month labels ── */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ─────────────────────────────────────────────
   Generate 12 months of plausible data from
   the last optimize-route result + mild variance
──────────────────────────────────────────────── */
function generateMonthlyData(routeData) {
  const baselineKm = routeData?.baseline_distance_km ?? 48;
  const optimizedKm = routeData?.optimized_distance_km ?? 28;

  // Fleets run ~25 trips/month on a fixed schedule
  const TRIPS_PER_MONTH = 25;

  const data = MONTHS.map((month, i) => {
    // Seasonal noise: more waste in summer & festive months (Oct-Dec)
    const seasonal = 1 + 0.12 * Math.sin((i / 11) * Math.PI) + (i >= 9 ? 0.08 : 0);
    const noise = 0.96 + Math.random() * 0.08;   // ±4 %

    const tradKm = baselineKm * TRIPS_PER_MONTH * seasonal * noise;
    const optKm = optimizedKm * TRIPS_PER_MONTH * seasonal * (noise * 0.97);

    const tradFuel = tradKm * L_PER_KM;
    const optFuel = optKm * L_PER_KM;
    const tradCO2 = tradFuel * CO2_KG_PER_L;
    const optCO2 = optFuel * CO2_KG_PER_L;
    const tradCost = tradFuel * DIESEL_PRICE;
    const optCost = optFuel * DIESEL_PRICE;

    return {
      month,
      tradFuel: +tradFuel.toFixed(0),
      optFuel: +optFuel.toFixed(0),
      savedFuel: +(tradFuel - optFuel).toFixed(0),
      tradCO2: +tradCO2.toFixed(0),
      optCO2: +optCO2.toFixed(0),
      savedCO2: +(tradCO2 - optCO2).toFixed(0),
      tradCost: +tradCost.toFixed(0),
      optCost: +optCost.toFixed(0),
      savedCost: +(tradCost - optCost).toFixed(0),
    };
  });

  return data;
}

/* ── Custom tooltip ── */
function CustomTooltip({ active, payload, label, unit, prefix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-card-border)",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 11,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <p style={{ fontWeight: 900, color: "var(--color-text)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: p.color, fontWeight: 700 }}>
          <span>{p.name}</span>
          <span>{prefix}{Number(p.value).toLocaleString("en-IN")}{unit ? ` ${unit}` : ""}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Summary KPI card ── */
function KpiCard({ icon: Icon, label, value, unit, color, sub, delay = 0 }) {
  return (
    <div
      className="glass-panel px-5 py-4 flex items-center gap-4 slide-in"
      style={{ animationDelay: `${delay}ms`, borderColor: `${color}22` }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}15`, border: `1px solid ${color}33` }}
      >
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-text-dim)]">{label}</p>
        <div className="flex items-baseline gap-1 mt-0.5">
          <span className="text-[22px] font-black tabular-nums leading-none" style={{ color }}>{value}</span>
          <span className="text-[10px] font-bold text-[var(--color-text-muted)]">{unit}</span>
        </div>
        {sub && <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Section header ── */
function SectionHeader({ icon: Icon, title, accent, description }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
      >
        <Icon size={16} style={{ color: accent }} />
      </div>
      <div>
        <h2 className="text-[13px] font-black uppercase tracking-[0.15em] text-[var(--color-text)]">{title}</h2>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{description}</p>
      </div>
    </div>
  );
}

/* ── Chart card wrapper ── */
function ChartCard({ children, delay = 0 }) {
  return (
    <div className="glass-panel p-3.5 sm:p-5 slide-in min-h-[300px] sm:min-h-[360px] flex flex-col overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const GREEN = "#39ff14";
const CYAN = "#00dbe9";
const AMBER = "#f59e0b";
const PURPLE = "#a855f7";
const RED = "#ff4d4d";

const CHART_STYLE = {
  stroke: "var(--color-card-border)",
  tick: { fill: "var(--color-text-dim)", fontSize: 9, fontWeight: 700, fontFamily: "Inter" },
};

export default function AnalyticsPage({ routeData }) {
  const [chartType, setChartType] = useState("area"); // "area" | "bar"

  const data = useMemo(() => generateMonthlyData(routeData), [routeData]);

  /* Annual totals */
  const totals = useMemo(() => {
    const sum = (key) => data.reduce((a, d) => a + d[key], 0);
    return {
      savedFuel: sum("savedFuel"),
      savedCO2: sum("savedCO2"),
      savedCost: sum("savedCost"),
      tradFuel: sum("tradFuel"),
      optFuel: sum("optFuel"),
    };
  }, [data]);

  const pct = totals.tradFuel > 0 ? ((totals.savedFuel / totals.tradFuel) * 100).toFixed(1) : 0;

  const ChartComponent = chartType === "area" ? AreaChart : BarChart;

  const commonAxisProps = {
    xAxis: <XAxis dataKey="month" tick={CHART_STYLE.tick} axisLine={false} tickLine={false} />,
    grid: <CartesianGrid strokeDasharray="3 3" stroke="var(--color-card-border)" opacity={0.5} />,
    legend: (
      <Legend
        wrapperStyle={{ fontSize: 9, fontWeight: 800, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em", paddingTop: 12 }}
      />
    ),
  };

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg)] text-[var(--color-text)] font-inter antialiased overflow-hidden">
      {/* ─── Sub-header ─── */}
      <div className="px-4 sm:px-8 pt-4 sm:pt-5 pb-3 sm:pb-4 shrink-0 border-b border-[var(--color-card-border)]">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-[15px] sm:text-[17px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] text-[var(--color-text)] flex items-center gap-2">
              <BarChart2 size={16} className="text-[var(--color-purple)] sm:w-[18px] sm:h-[18px]" />
              Analytics
              <span className="text-[var(--color-purple)]">·</span>
              <span className="text-[var(--color-text-dim)] text-[11px] sm:text-[12px]">Monthly Efficiency</span>
            </h1>
            <p className="text-[9px] sm:text-[10px] text-[var(--color-text-muted)] mt-0.5 uppercase tracking-widest">
              Traditional schedule vs AI-optimised routing — 12-month projection
            </p>
          </div>
          {/* Chart type toggle */}
          <div className="flex items-center gap-1 glass-panel p-1">
            {[["area", "Area"], ["bar", "Bar"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setChartType(val)}
                className="px-2.5 sm:px-3 py-1 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all"
                style={{
                  background: chartType === val ? "var(--color-purple)" : "transparent",
                  color: chartType === val ? "#fff" : "var(--color-text-dim)",
                  border: "none",
                  boxShadow: "none",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Annual KPIs ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mt-3 sm:mt-4">
          <KpiCard icon={Fuel} label="Annual Fuel Saved" value={totals.savedFuel.toLocaleString("en-IN")} unit="L" color={AMBER} sub={`${pct}% reduction`} delay={0} />
          <KpiCard icon={Leaf} label="CO₂ Avoided" value={(totals.savedCO2 / 1000).toFixed(1)} unit="tonnes/yr" color={GREEN} sub="vs fixed schedule" delay={60} />
          <KpiCard icon={IndianRupee} label="Cost Savings" value={`₹${(totals.savedCost / 100000).toFixed(1)}L`} unit="per year" color={CYAN} sub="fleet operating cost" delay={120} />
          <KpiCard icon={TrendingDown} label="Route Efficiency" value={`${pct}%`} unit="km saved" color={PURPLE} sub="optimized vs traditional" delay={180} />
        </div>
      </div>

      {/* ─── Charts ─── */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-8 py-4 sm:py-5 custom-scrollbar">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* FUEL */}
          <ChartCard delay={0}>
            <div className="flex flex-col h-full">
              <SectionHeader
                icon={Fuel}
                title="Monthly Fuel Consumption"
                accent={AMBER}
                description="Litres consumed — traditional vs AI-optimised"
              />
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ChartComponent data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    {commonAxisProps.grid}
                    {commonAxisProps.xAxis}
                    <YAxis tick={CHART_STYLE.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v} L`} width={40} />
                    <Tooltip content={<CustomTooltip unit="L" />} />
                    {commonAxisProps.legend}
                    {chartType === "area" ? (
                      <>
                        <defs>
                          <linearGradient id="gTrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={RED} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={RED} stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="gOpt" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={AMBER} stopOpacity={0.35} />
                            <stop offset="95%" stopColor={AMBER} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="tradFuel" name="Traditional" stroke={RED} fill="url(#gTrad)" strokeWidth={2} dot={false} />
                        <Area type="monotone" dataKey="optFuel" name="Optimised" stroke={AMBER} fill="url(#gOpt)" strokeWidth={2} dot={false} />
                      </>
                    ) : (
                      <>
                        <Bar dataKey="tradFuel" name="Traditional" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={18} />
                        <Bar dataKey="optFuel" name="Optimised" fill={AMBER} radius={[4, 4, 0, 0]} maxBarSize={18} />
                      </>
                    )}
                  </ChartComponent>
                </ResponsiveContainer>
              </div>
              {/* Savings bar */}
              <div className="mt-3 pt-3 border-t border-[var(--color-card-border)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <Zap size={12} style={{ color: AMBER }} />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-dim)]">Monthly savings avg</span>
                </div>
                <span className="text-[13px] font-black tabular-nums" style={{ color: AMBER }}>
                  {Math.round(totals.savedFuel / 12).toLocaleString("en-IN")} L
                </span>
              </div>
            </div>
          </ChartCard>

          {/* CO2 */}
          <ChartCard delay={80}>
            <div className="flex flex-col h-full">
              <SectionHeader
                icon={Leaf}
                title="Monthly CO₂ Emissions"
                accent={GREEN}
                description="kg CO₂ emitted — traditional vs optimised (2.68 kg/L)"
              />
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ChartComponent data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    {commonAxisProps.grid}
                    {commonAxisProps.xAxis}
                    <YAxis tick={CHART_STYLE.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}kg`} width={45} />
                    <Tooltip content={<CustomTooltip unit="kg" />} />
                    {commonAxisProps.legend}
                    {chartType === "area" ? (
                      <>
                        <defs>
                          <linearGradient id="gC2trad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={RED} stopOpacity={0.28} />
                            <stop offset="95%" stopColor={RED} stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="gC2opt" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={GREEN} stopOpacity={0.35} />
                            <stop offset="95%" stopColor={GREEN} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="tradCO2" name="Traditional" stroke={RED} fill="url(#gC2trad)" strokeWidth={2} dot={false} />
                        <Area type="monotone" dataKey="optCO2" name="Optimised" stroke={GREEN} fill="url(#gC2opt)" strokeWidth={2} dot={false} />
                      </>
                    ) : (
                      <>
                        <Bar dataKey="tradCO2" name="Traditional" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={18} />
                        <Bar dataKey="optCO2" name="Optimised" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={18} />
                      </>
                    )}
                  </ChartComponent>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 pt-3 border-t border-[var(--color-card-border)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <Leaf size={12} style={{ color: GREEN }} />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-dim)]">Annual CO₂ avoided</span>
                </div>
                <span className="text-[13px] font-black tabular-nums" style={{ color: GREEN }}>
                  {(totals.savedCO2 / 1000).toFixed(1)} tonnes
                </span>
              </div>
            </div>
          </ChartCard>

          {/* COST */}
          <ChartCard delay={160}>
            <div className="flex flex-col h-full">
              <SectionHeader
                icon={IndianRupee}
                title="Monthly Fuel Cost"
                accent={CYAN}
                description="₹ spent — traditional vs optimised @ ₹93/L"
              />
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ChartComponent data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    {commonAxisProps.grid}
                    {commonAxisProps.xAxis}
                    <YAxis tick={CHART_STYLE.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={44} />
                    <Tooltip content={<CustomTooltip prefix="₹" />} />
                    {commonAxisProps.legend}
                    {chartType === "area" ? (
                      <>
                        <defs>
                          <linearGradient id="gCtrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={RED} stopOpacity={0.28} />
                            <stop offset="95%" stopColor={RED} stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="gCopt" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CYAN} stopOpacity={0.35} />
                            <stop offset="95%" stopColor={CYAN} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="tradCost" name="Traditional" stroke={RED} fill="url(#gCtrad)" strokeWidth={2} dot={false} />
                        <Area type="monotone" dataKey="optCost" name="Optimised" stroke={CYAN} fill="url(#gCopt)" strokeWidth={2} dot={false} />
                      </>
                    ) : (
                      <>
                        <Bar dataKey="tradCost" name="Traditional" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={18} />
                        <Bar dataKey="optCost" name="Optimised" fill={CYAN} radius={[4, 4, 0, 0]} maxBarSize={18} />
                      </>
                    )}
                  </ChartComponent>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 pt-3 border-t border-[var(--color-card-border)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <IndianRupee size={12} style={{ color: CYAN }} />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-dim)]">Annual cost saved</span>
                </div>
                <span className="text-[13px] font-black tabular-nums" style={{ color: CYAN }}>
                  ₹{(totals.savedCost / 100000).toFixed(2)}L
                </span>
              </div>
            </div>
          </ChartCard>

          {/* SAVINGS COMBO */}
          <ChartCard delay={240}>
            <div className="flex flex-col h-full">
              <SectionHeader
                icon={TrendingDown}
                title="Monthly Savings Breakdown"
                accent={PURPLE}
                description="Fuel & CO₂ saved each month by AI-optimised routing"
              />
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-card-border)" opacity={0.5} />
                    <XAxis dataKey="month" tick={CHART_STYLE.tick} axisLine={false} tickLine={false} />
                    <YAxis tick={CHART_STYLE.tick} axisLine={false} tickLine={false} width={28} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 9, fontWeight: 800, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em", paddingTop: 12 }} />
                    <Bar dataKey="savedFuel" name="Fuel Saved (L)" fill={AMBER} radius={[4, 4, 0, 0]} maxBarSize={14} />
                    <Bar dataKey="savedCO2" name="CO₂ Saved (kg)" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 pt-3 border-t border-[var(--color-card-border)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <TrendingDown size={12} style={{ color: PURPLE }} />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-dim)]">Route efficiency gain</span>
                </div>
                <span className="text-[13px] font-black tabular-nums" style={{ color: PURPLE }}>{pct}%</span>
              </div>
            </div>
          </ChartCard>
        </div>
        <div className="h-6" />
      </div>
    </div>
  );
}

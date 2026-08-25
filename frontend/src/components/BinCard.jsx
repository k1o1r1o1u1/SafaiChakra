import { Trash2, Zap, WifiOff } from "lucide-react";

function FillGauge({ pct, threshold }) {
  const isCritical = pct >= threshold;
  const isWarning = pct >= threshold - 30;
  
  // Using theme-aware deep accents for soothing mode
  const color = isCritical ? "var(--color-red)" : isWarning ? "var(--color-amber)" : "var(--color-green)";

  return (
    <div className="flex flex-col items-center gap-1.5 mt-0.5">
      <div className="relative w-[34px] h-[58px]">
        {/* Lid (Tactical HUD Style) */}
        <div className="absolute -top-[2px] left-1/2 -translate-x-1/2 w-[28px] h-1 bg-[var(--color-card-border)] rounded-full z-10" />
        
        {/* Body (Solid Modern Cylinder) */}
        <div 
          className="absolute inset-0 rounded-[10px] overflow-hidden bg-[var(--color-bg)] border-2 border-[var(--color-card-border)] shadow-inner"
        >
          {/* Fill Layer */}
          <div 
            className="absolute bottom-0 left-0 right-0 transition-all duration-1000 ease-out" 
            style={{ 
              height: `${Math.max(0, Math.min(100, pct))}%`, 
              backgroundColor: color,
              boxShadow: `0 0 15px ${color}88 inset, 0 0 20px ${color}44`,
              backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.1), rgba(255,255,255,0.2))`
            }} 
          >
            {/* Liquid Surface Glow */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-white/40 blur-[1px]" />
          </div>
          
          {/* Subtle Measurement Notches */}
          {[25, 50, 75].map(y => (
            <div 
              key={y} 
              className="absolute left-0 right-0 h-px transition-colors duration-500" 
              style={{ 
                bottom: `${y}%`, 
                background: pct >= y ? "rgba(255,255,255,0.2)" : "var(--color-card-border)" 
              }} 
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center pt-1">
        <span className="text-[22px] font-black leading-tight tabular-nums tracking-tighter" style={{ color }}>
          {pct.toFixed(0)}<span className="text-[12px] font-bold text-[var(--color-text-dim)] ml-0.5">%</span>
        </span>
      </div>
    </div>
  );
}

export default function BinCard({ status, loading, threshold = 70, sensorDiag = null }) {
  if (loading || !status) {
    return (
      <div className="glass-panel p-6 flex items-center justify-center animate-pulse border-[var(--color-card-border)] bg-[var(--color-surface)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-t-[var(--color-green)] border-[var(--color-card-border)] animate-spin" />
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-text-dim)]">Syncing Node...</span>
        </div>
      </div>
    );
  }

  const { bin_id, fill_pct, is_alert, message } = status;
  const isCritical = is_alert || fill_pct >= threshold;
  const isWarning = !isCritical && fill_pct >= threshold - 30;
  const accentColor = isCritical ? "var(--color-red)" : isWarning ? "var(--color-amber)" : "var(--color-green)";

  // Sensor health
  const sensorFailed = sensorDiag && sensorDiag.severity === "FAILURE";
  const sensorWarn   = sensorDiag && sensorDiag.severity === "WARNING";
  const sensorColor = sensorFailed ? "var(--color-red)" : sensorWarn ? "var(--color-amber)" : "var(--color-green)";
  const sensorLabel = sensorFailed ? "FAULT" : sensorWarn ? "WARN" : "OK";

  return (
    <div className={`glass-panel p-3.5 pb-5 relative overflow-hidden transition-all duration-500 border-[var(--color-card-border)] shrink-0 ${isCritical ? 'ring-2 ring-red-500/20' : ''} ${sensorFailed ? 'ring-2 ring-orange-500/30' : ''}`}>
      
      {/* Structural Corner Icon */}
      <div className="absolute -top-4 -right-4 opacity-[0.03] text-[var(--color-text)]">
        <Zap size={80} />
      </div>
 
      {/* Header row */}
      <div className="flex items-start justify-between mb-3.5 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-[32px] h-[32px] rounded-xl flex items-center justify-center bg-[var(--color-bg)] border border-[var(--color-card-border)] shadow-sm">
             <Trash2 size={16} style={{ color: accentColor }} />
          </div>
          <div>
            <p className="text-[8px] text-[var(--color-text-dim)] uppercase tracking-[0.2em] font-black mb-0.5">Focus Node</p>
            <p className="text-[19px] font-black text-[var(--color-text)] leading-none tracking-tight">
              {bin_id === "DEPOT_00" ? "Main HUB" : bin_id}
            </p>
          </div>
        </div>

        {/* Collection Needed Tag */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-bg)] border border-[var(--color-card-border)] shadow-inner">
          <div className={`w-1.5 h-1.5 rounded-full ${isCritical ? 'bg-[var(--color-red)]' : 'bg-[var(--color-green)]'} animate-pulse`} />
          <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-tight">
            {message || (isCritical ? "ALERT" : "STABLE")}
          </span>
        </div>
      </div>

      {/* Gauge + stats row */}
      <div className="flex items-start gap-5 relative z-10">
        <FillGauge pct={fill_pct} threshold={threshold} />

        <div className="flex-1 flex flex-col gap-3 pt-0.5">
          {/* Progress Section */}
          <div>
            <div className="flex justify-between items-end mb-1.5">
              <span className="text-[10.5px] font-black uppercase tracking-widest text-[var(--color-text-dim)]">Substrate</span>
              <span className="text-[15px] font-black tabular-nums" style={{ color: accentColor }}>
                {fill_pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-[var(--color-bg)] rounded-full overflow-hidden border border-[var(--color-card-border)] shadow-inner">
              <div 
                className="h-full transition-all duration-1000 ease-out"
                style={{ 
                  width: `${Math.max(0, Math.min(100, fill_pct))}%`,
                  backgroundColor: accentColor,
                  boxShadow: `2px 0 8px ${accentColor}44`
                }} 
              />
            </div>
          </div>

          {/* Grid Stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "State", val: is_alert ? "ALERT" : "STABLE", color: is_alert ? "var(--color-red)" : "var(--color-green)" },
              { label: "Free", val: `${Math.max(0, (100 - fill_pct)).toFixed(0)}%`, color: "var(--color-cyan)" },
              { label: "Sensor", val: sensorLabel, color: sensorColor },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-[var(--color-bg)] border border-[var(--color-card-border)] rounded-xl p-1.5 text-center shadow-sm">
                <p className="text-[9.5px] text-[var(--color-text-dim)] uppercase tracking-tight font-black mb-0.5">{label}</p>
                <p className="text-[12px] font-black tracking-tight" style={{ color }}>{val}</p>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Sensor Health Diagnostic Banner ── */}
      {sensorDiag && sensorDiag.severity !== "OK" && (
        <div className={`mt-3 px-3 py-2 rounded-xl border transition-all sensor-diag-enter ${
          sensorFailed 
            ? "bg-orange-500/8 border-orange-500/25" 
            : "bg-[var(--color-amber)]/8 border-[var(--color-amber)]/25"
        }`}>
          <div className="flex items-center gap-2 mb-1.5">
            <WifiOff size={12} className={sensorFailed ? "text-orange-400" : "text-[var(--color-amber)]"} />
            <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${
              sensorFailed ? "text-orange-400" : "text-[var(--color-amber)]"
            }`}>
              Sensor {sensorDiag.severity}
            </span>
            {sensorDiag.last_seen_seconds_ago != null && (
              <span className="ml-auto text-[9px] font-bold text-[var(--color-text-muted)]">
                {sensorDiag.last_seen_seconds_ago < 60 
                  ? `${sensorDiag.last_seen_seconds_ago}s ago`
                  : `${Math.floor(sensorDiag.last_seen_seconds_ago / 60)}m ago`
                }
              </span>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            {sensorDiag.issues.map((issue, i) => (
              <p key={i} className="text-[9px] font-medium text-[var(--color-text-muted)] leading-tight">
                • {issue}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

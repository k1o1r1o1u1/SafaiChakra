import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { Zap, ShieldAlert, Loader2, WifiOff } from "lucide-react";

import Navbar from "./components/Navbar";
import BinCard from "./components/BinCard";
import MapView from "./components/MapView";
import ControlPanel from "./components/ControlPanel";
import AgentPanel from "./components/AgentPanel";
import SavingsCard from "./components/SavingsCard";
import AnalyticsPage from "./components/AnalyticsPage";


// Use a relative path in production so FastAPI can serve the frontend directly
const API_BASE = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === "development" ? `http://${window.location.hostname}:8000` : "");
const POLL_MS = 300000; // Auto-refresh every 5 minutes (user will manually refresh for demo)

// Bypass Ngrok free tier browser warning
axios.defaults.headers.common["ngrok-skip-browser-warning"] = "69420";

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [allBins, setAllBins] = useState([]);
  const [activeBin, setActiveBin] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [threshold, setThreshold] = useState(60);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState(null);
  const [toastHidden, setToastHidden] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Hackathon AI Feature
  const [showPredictiveMap, setShowPredictiveMap] = useState(false);
  const [predictiveData, setPredictiveData] = useState(null);

  const [trafficStrokes, setTrafficStrokes] = useState([]);
  const [drawTrafficEnabled, setDrawTrafficEnabled] = useState(false);

  // Sensor Health / Failure Detection
  const [sensorHealth, setSensorHealth] = useState(null);
  const [sensorToast, setSensorToast] = useState(null);
  const [sensorToastClosing, setSensorToastClosing] = useState(false);

  // Resizable Sidebar State (Vertical Divider)
  const [sidebarWidth, setSidebarWidth] = useState(450);
  const [isResizing, setIsResizing] = useState(false);

  // Resizable Bottom State (Horizontal Divider)
  const [bottomHeight, setBottomHeight] = useState(120);
  const [isResizingV, setIsResizingV] = useState(false);

  const startResizing = useCallback(() => setIsResizing(true), []);
  const stopResizing = useCallback(() => setIsResizing(false), []);

  const startResizingV = useCallback(() => setIsResizingV(true), []);
  const stopResizingV = useCallback(() => setIsResizingV(false), []);

  const resize = useCallback((e) => {
    if (isResizing) {
      const newWidth = e.clientX - 32;
      if (newWidth > 300 && newWidth < window.innerWidth * 0.5) {
        setSidebarWidth(newWidth);
      }
    }
    if (isResizingV) {
      const newHeight = window.innerHeight - e.clientY - 32;
      if (newHeight > 60 && newHeight < window.innerHeight * 0.4) {
        setBottomHeight(newHeight);
      }
    }
  }, [isResizing, isResizingV]);

  useEffect(() => {
    const onMouseUp = () => {
      stopResizing();
      stopResizingV();
    };

    if (isResizing || isResizingV) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = isResizing ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    } else {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, isResizingV, resize, stopResizing, stopResizingV]);
  // 1. Fetch all known bins
  const fetchAllBins = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/bin/all`);
      const uiBins = data
        .filter(id => !id.toLowerCase().includes("depot"))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      setAllBins(uiBins);
      if (uiBins.length > 0) setActiveBin(prev => prev ?? uiBins[0]);
      return data;
    } catch (err) {
      return [];
    }
  }, []);

  // 2. Sync Engine
  const fetchData = useCallback(async (signal) => {
    if (!autoRefresh) setLoading(true);
    try {
      const bins = await fetchAllBins();
      const results = await Promise.allSettled(
        bins.map(id => axios.get(`${API_BASE}/bin/status/${id}`))
      );

      const statusMap = {};
      results.forEach((res, i) => {
        if (res.status === "fulfilled") {
          statusMap[bins[i]] = res.value.data;
        } else {
          console.error(`Failed to fetch status for ${bins[i]}:`, res.reason);
        }
      });

      setStatuses(statusMap);
      setIsLive(true);
      setError(null);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      if (!axios.isCancel(err)) setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, [fetchAllBins, autoRefresh]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    let intervalId;
    if (autoRefresh) {
      intervalId = setInterval(() => fetchData(controller.signal), POLL_MS);
    }
    return () => {
      controller.abort();
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchData, autoRefresh]);

  const addTrafficStroke = useCallback((positions) => {
    if (!positions?.length) return;
    setTrafficStrokes((prev) => [...prev, positions]);
  }, []);

  // ── Sensor Health Polling ──
  const fetchSensorHealth = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/sensor/health`);
      setSensorHealth(data);
    } catch (err) {
      console.error("Sensor health fetch failed", err);
    }
  }, []);

  // Fetch sensor health alongside main data
  useEffect(() => {
    fetchSensorHealth();
    const id = setInterval(fetchSensorHealth, POLL_MS);
    return () => clearInterval(id);
  }, [fetchSensorHealth]);

  const handleSimulateSensorFailure = useCallback(async (scenario) => {
    if (!activeBin) return;
    try {
      const { data } = await axios.post(`${API_BASE}/sensor/simulate-failure`, {
        bin_id: activeBin,
        scenario,
      });
      setSensorToast(data);
      setSensorToastClosing(false);
      // Refresh sensor health + bin statuses
      await Promise.all([fetchSensorHealth(), fetchData()]);
      // Auto-close toast after 6s
      setTimeout(() => {
        setSensorToastClosing(true);
        setTimeout(() => setSensorToast(null), 400);
      }, 6000);
    } catch (err) {
      console.error("Sensor failure simulation failed", err);
    }
  }, [activeBin, fetchSensorHealth, fetchData]);

  const handleResetSensor = useCallback(async () => {
    if (!activeBin) return;
    try {
      await axios.post(`${API_BASE}/sensor/reset/${activeBin}`);
      await Promise.all([fetchSensorHealth(), fetchData()]);
      setSensorToast(null);
    } catch (err) {
      console.error("Sensor reset failed", err);
    }
  }, [activeBin, fetchSensorHealth, fetchData]);

  const handleOptimize = useCallback(async () => {
    setOptimizing(true);
    try {
      const trafficZones = [];
      for (const stroke of trafficStrokes) {
        for (let i = 0; i < stroke.length - 1; i += 1) {
          trafficZones.push({
            start: [stroke[i][0], stroke[i][1]],
            end: [stroke[i + 1][0], stroke[i + 1][1]],
            severity: "high",
          });
        }
      }
      const useSpilloverPrediction = Boolean(showPredictiveMap && predictiveData?.length);
      const { data } = await axios.post(`${API_BASE}/optimize-route`, {
        threshold,
        trafficZones,
        trafficMode: "penalize",
        useSpilloverPrediction,
      });
      setRouteData(data);
      setError(null);
    } catch (err) {
      setError("Routing Engine Offline.");
    } finally {
      setOptimizing(false);
    }
  }, [threshold, trafficStrokes, showPredictiveMap, predictiveData]);

  const handleSimulateAlert = async () => {
    if (!activeBin) return;
    setToastHidden(false);
    setStatuses(prev => ({ ...prev, [activeBin]: { ...prev[activeBin], fill_pct: 87, is_alert: true } }));
    try {
      await axios.post(`${API_BASE}/bin/update`, { bin_id: activeBin, fill_pct: 87, distance_cm: 15 });
    } catch (e) { console.error(e); }
  };

  const togglePredictiveMode = async () => {
    if (showPredictiveMap) {
      setShowPredictiveMap(false);
      setPredictiveData(null);
    } else {
      setShowPredictiveMap(true);
      try {
        const res = await axios.get(`${API_BASE}/bin/predict`);
        setPredictiveData(res.data.predictions);
      } catch (err) {
        console.error("Failed to fetch predictions", err);
      }
    }
  };

  // ── 3. Derived Variables (Must be before the return) ──────────────────
  const route = useMemo(() => routeData?.route ?? null, [routeData]);
  const activeStatus = useMemo(() => (activeBin ? statuses[activeBin] : null), [activeBin, statuses]);

  // Current bin's sensor health
  const activeSensorDiag = useMemo(() => {
    if (!sensorHealth?.sensors || !activeBin) return null;
    return sensorHealth.sensors.find(s => s.bin_id === activeBin) || null;
  }, [sensorHealth, activeBin]);

  const handleCloseToast = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setToastHidden(true);
      setIsClosing(false);
    }, 400); // sync with CSS duration
  }, []);

  // Handle 5-second auto-close for critical alerts
  useEffect(() => {
    if (activeStatus?.is_alert && !toastHidden && !isClosing) {
      const timer = setTimeout(handleCloseToast, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeStatus?.is_alert, toastHidden, isClosing, activeBin, handleCloseToast]);

  // Reset toast visibility when switching focus between bins
  useEffect(() => {
    setToastHidden(false);
    setIsClosing(false);
  }, [activeBin]);

  // Mobile dashboard tab switcher (only used below lg breakpoint)
  const [mobileTab, setMobileTab] = useState("map"); // "map" | "controls"

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg)] text-[var(--color-text)] selection:bg-[var(--color-green)]/30 font-inter antialiased overflow-hidden transition-colors duration-300">
      <Navbar lastUpdated={lastUpdated} isLive={isLive} page={page} setPage={setPage} onRefresh={() => fetchData()} />

      {page === "analytics" && (
        <div className="flex-1 overflow-hidden mt-14 sm:mt-16 slide-in">
          <AnalyticsPage routeData={routeData} />
        </div>
      )}

      <main className={`flex-1 overflow-hidden px-3 py-2 sm:px-6 sm:py-4 lg:px-8 lg:py-6 flex flex-col mt-14 sm:mt-16 slide-in ${page !== "dashboard" ? "hidden" : ""}`}>
        {error && (
          <div className="glass-panel border-red-500/20 bg-red-500/5 mb-3 sm:mb-4 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Zap size={15} className="text-red-400 shrink-0" />
              <p className="text-xs sm:text-sm font-medium text-red-200 truncate">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="hover:bg-white/10 p-1.5 rounded-lg shrink-0">✕</button>
          </div>
        )}

        {/* Mobile View Switcher Pill (Visible only on < lg screens) */}
        <div className="flex lg:hidden items-center justify-center gap-1.5 mb-2.5 p-1 bg-[var(--color-surface)] border border-[var(--color-card-border)] rounded-xl shrink-0">
          <button
            onClick={() => setMobileTab("map")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              mobileTab === "map"
                ? "bg-[var(--color-green)]/15 border border-[var(--color-green)]/40 text-[var(--color-green)] shadow-sm"
                : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            }`}
          >
            <span>🗺️</span>
            <span>Map & Route</span>
          </button>
          <button
            onClick={() => setMobileTab("controls")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              mobileTab === "controls"
                ? "bg-[var(--color-purple)]/15 border border-[var(--color-purple)]/40 text-[var(--color-purple)] shadow-sm"
                : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            }`}
          >
            <span>🎛️</span>
            <span>Nodes & Intel</span>
          </button>
        </div>

        {activeStatus?.is_alert && !toastHidden && (
          <div className={`fixed top-16 sm:top-24 right-3 left-3 sm:left-auto sm:right-6 z-[1000] glass-panel border-red-500/30 bg-red-500/10 p-3 sm:p-4 sm:min-w-[340px] shadow-[var(--glow-neon)] ${isClosing ? 'animate-alert-pop-out' : 'animate-alert-pop-in'}`}>
            <div className="flex gap-3 sm:gap-4">
              <div className="relative shrink-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-xl sm:text-2xl">🚨</div>
                <div className="absolute inset-0 rounded-2xl border-2 border-red-500 animate-ping opacity-20"></div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <ShieldAlert size={14} className="text-red-400 shrink-0" />
                  <h3 className="text-[11px] sm:text-xs font-black tracking-widest uppercase truncate">Critical Overflow</h3>
                </div>
                <p className="text-[10px] sm:text-[11px] mt-0.5 sm:mt-1 font-bold opacity-70 truncate">Node {activeBin} at {activeStatus.fill_pct.toFixed(0)}%</p>
                <button
                  onClick={handleOptimize}
                  disabled={optimizing}
                  className="mt-2 sm:mt-3 w-full py-1.5 sm:py-2 bg-red-500/20 hover:bg-red-500/40 border border-red-500/40 rounded-lg text-[9.5px] sm:text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  {optimizing ? <Loader2 className="animate-spin mx-auto" size={13} /> : "Dispatch Fleet →"}
                </button>
              </div>
              <button onClick={handleCloseToast} className="self-start opacity-20 hover:opacity-100 p-1">✕</button>
            </div>
          </div>
        )}

        {/* ── Sensor Failure Toast ── */}
        {sensorToast && (
          <div className={`fixed top-16 sm:top-24 right-3 left-3 sm:left-auto sm:right-6 z-[1000] glass-panel border-orange-500/30 bg-orange-500/10 p-3 sm:p-4 sm:min-w-[340px] shadow-[0_0_20px_rgba(249,115,22,0.2)] ${sensorToastClosing ? 'animate-alert-pop-out' : 'animate-alert-pop-in'}`}>
            <div className="flex gap-3 sm:gap-4">
              <div className="relative shrink-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center text-xl sm:text-2xl">⚡</div>
                <div className="absolute inset-0 rounded-2xl border-2 border-orange-500 animate-ping opacity-20"></div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <WifiOff size={14} className="text-orange-400 shrink-0" />
                  <h3 className="text-[11px] sm:text-xs font-black tracking-widest uppercase truncate">Sensor Fault Injected</h3>
                </div>
                <p className="text-[10px] sm:text-[11px] mt-0.5 sm:mt-1 font-bold opacity-70 truncate">{sensorToast.description}</p>
                <p className="text-[9.5px] sm:text-[10px] mt-0.5 opacity-50 font-mono truncate">{sensorToast.injected}</p>
                <button
                  onClick={handleResetSensor}
                  className="mt-2 sm:mt-3 w-full py-1.5 sm:py-2 bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/40 rounded-lg text-[9.5px] sm:text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Reset Sensor →
                </button>
              </div>
              <button onClick={() => { setSensorToastClosing(true); setTimeout(() => setSensorToast(null), 400); }} className="self-start opacity-20 hover:opacity-100 p-1">✕</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-0 items-stretch relative">
          {/* 1. Left Sidebar (Controls & Nodes) */}
          <section
            className={`h-full overflow-y-auto space-y-4 sm:space-y-6 pr-0 lg:pr-4 custom-scrollbar shrink-0 w-full lg:w-auto ${
              mobileTab === "controls" ? "flex flex-col" : "hidden lg:flex lg:flex-col"
            }`}
            style={{ width: window.innerWidth >= 1024 ? `${sidebarWidth}px` : "100%" }}
          >
            <BinCard status={activeStatus} loading={loading} threshold={threshold} sensorDiag={activeSensorDiag} />
            <ControlPanel
              onRefresh={() => fetchData()}
              onOptimize={handleOptimize}
              onSimulateAlert={handleSimulateAlert}
              autoRefresh={autoRefresh}
              onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
              threshold={threshold}
              onThresholdChange={setThreshold}
              optimizing={optimizing}
              loading={loading}
              showPredictiveMap={showPredictiveMap}
              onTogglePredict={togglePredictiveMode}
              allBins={allBins}
              activeBin={activeBin}
              setActiveBin={setActiveBin}
              statuses={statuses}
              trafficStrokeCount={trafficStrokes.length}
              onClearTraffic={() => setTrafficStrokes([])}
              onSimulateSensorFailure={handleSimulateSensorFailure}
              onResetSensor={handleResetSensor}
              sensorHealth={sensorHealth}
            />
            <AgentPanel route={route} optimizing={optimizing} status={activeStatus} />

            <footer className="pb-6 border-t border-[var(--color-card-border)] pt-4 sm:pt-6 flex flex-col items-center gap-3">
              <div className="text-center space-y-1">
                <p className="text-[9px] uppercase tracking-[0.4em] text-[var(--color-text-dim)] font-black">SafaiChakra Intelligence System</p>
                <p className="text-[8px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest leading-relaxed">Smart Waste Collection Route Optimizer<br />© {new Date().getFullYear()}</p>
              </div>
            </footer>
          </section>

          {/* 2. Drag Divider (Desktop only) */}
          <div
            onMouseDown={startResizing}
            className={`hidden lg:flex group w-1 hover:bg-[var(--color-green)]/20 cursor-col-resize transition-all items-center justify-center relative z-[1010] mx-1 ${isResizing ? 'bg-[var(--color-green)]/30 w-1.5' : 'bg-transparent'}`}
          />

          {/* 3. Right Map Section */}
          <section className={`flex-1 flex flex-col gap-0 h-full overflow-hidden min-w-0 w-full ${
            mobileTab === "map" ? "flex" : "hidden lg:flex"
          }`}>
            <div className="flex-1 relative min-h-[260px]">
              <MapView
                route={route}
                optimizing={optimizing}
                statuses={statuses}
                threshold={threshold}
                showPredictiveMap={showPredictiveMap}
                predictiveData={predictiveData}
                sensorHealth={sensorHealth}
                trafficStrokes={trafficStrokes}
                drawTrafficEnabled={drawTrafficEnabled}
                onToggleDrawTraffic={() => setDrawTrafficEnabled((v) => !v)}
                onAddTrafficStroke={addTrafficStroke}
                onClearTraffic={() => setTrafficStrokes([])}
              />
            </div>

            {/* Horizontal Drag Divider (Desktop only) */}
            <div
              onMouseDown={startResizingV}
              className={`hidden lg:block h-1.5 hover:h-2 hover:bg-[var(--color-green)]/30 cursor-row-resize transition-all relative z-[1010] my-1 ${isResizingV ? 'bg-[var(--color-green)]/40 h-2' : 'bg-transparent'}`}
            />

            <div className="shrink-0 overflow-y-auto custom-scrollbar mt-2 sm:mt-0" style={{ height: window.innerWidth >= 1024 ? `${bottomHeight}px` : "auto", maxHeight: "40vh" }}>
              <SavingsCard routeData={routeData} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { Maximize2, X, Navigation, LocateFixed, Brush, Trash2 } from "lucide-react";

// Fix for default Leaflet icon paths in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

// 🚛 Truck Icon
const makeTruckIcon = () =>
  L.divIcon({
    html: `<div style="font-size:20px;">🚛</div>`,
    className: "",
    iconSize: [30, 30],
  });

// 🏭 Depot Icon
const makeDepotIcon = () =>
  L.divIcon({
    html: `<div style="font-size:22px;">🏭</div>`,
    className: "",
    iconSize: [30, 30],
  });

// 📍 Locations builder
function buildLocations(statuses) {
  const map = {};
  Object.values(statuses || {}).forEach((s) => {
    if (s.latitude && s.longitude) {
      map[s.bin_id] = [s.latitude, s.longitude];
    }
  });
  return map;
}

/* ── Custom Icons ── */
// 🔥 ADD THIS NEW PIN ICON (replace makeIcon completely)

const makePinIcon = (status, threshold, sensorStatus) => {
  const pct = status.fill_pct ?? 0;
  const isCritical = status.is_alert || pct >= threshold;
  const isWarning = pct >= threshold - 30;
  const isFailed = sensorStatus && sensorStatus !== "OK";
  const isBin01 = status.bin_id === "BIN_01";

  const color = isFailed
    ? "#000000" // Black for failed sensor
    : isCritical
      ? "var(--color-red)"
      : isWarning
        ? "#eab308"
        : "var(--color-green)";

  return L.divIcon({
    className: "",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
        
        <!-- HEAD -->
        <div style="
          width:${isBin01 ? '24px' : '16px'};
          height:${isBin01 ? '24px' : '16px'};
          border-radius:50%;
          background:${color};
          box-shadow:0 0 20px ${color}AA;
          border:2px solid white;
          position:relative;
          z-index:2;
          display:flex;
          align-items:center;
          justify-content:center;
        ">
          ${isBin01 ? `
            <span style="color:white; font-size:8px; font-weight:800; font-family: 'Inter', sans-serif;">LIVE</span>
          ` : ''}
          ${isFailed
        ? `<div style="
                  position:absolute;
                  inset:-8px;
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  font-size:22px;
                  font-weight:900;
                  color:#ff0000;
                  text-shadow:0 0 6px rgba(0,0,0,0.9);
                  animation: pulse 1s infinite alternate;
                ">✕</div>`
        : !isBin01 && isCritical
          ? `<div style="
                    position:absolute;
                    inset:-6px;
                    border-radius:50%;
                    background:${color};
                    opacity:0.3;
                    animation:ping 1.5s infinite;
                  "></div>`
          : ""
      }
        </div>

      <!-- NEEDLE PIN -->
      <div style="
        width:2px;
        height:14px;
        background:${color};
        margin-top:-2px;
        border-radius:2px;
      "></div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
};

const OSRM = "https://router.project-osrm.org";

function resampleLatLngPath(points, maxPoints) {
  if (!points?.length || points.length <= maxPoints) return points;
  const out = [];
  const n = points.length;
  const step = (n - 1) / (maxPoints - 1);
  for (let k = 0; k < maxPoints; k += 1) {
    const idx = Math.min(n - 1, Math.round(k * step));
    out.push(points[idx]);
  }
  return out;
}

/** Merge GeoJSON coordinate rings into one [lat,lng] path (drops duplicate joint). */
function mergeGeoPaths(accum, chunk) {
  if (!chunk?.length) return accum;
  if (!accum.length) return chunk.slice();
  return accum.concat(chunk.slice(1));
}

/**
 * Driving geometry through [lat,lng] waypoints.
 * Uses per-leg OSRM requests when there are many stops so URLs stay within limits and
 * multi-via routes do not fail silently (which left the map on straight chords).
 */
async function osrmRoadThrough(waypointsLatLng) {
  if (!waypointsLatLng || waypointsLatLng.length < 2) return null;
  const qs = new URLSearchParams({ overview: "simplified", geometries: "geojson", steps: "false" });
  const q = qs.toString();

  async function fetchLeg(from, to) {
    const url = `${OSRM}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?${q}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]?.geometry?.coordinates?.length) return null;
    return data.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
  }

  const MAX_VIA = 22;
  if (waypointsLatLng.length <= MAX_VIA) {
    const path = waypointsLatLng.map(([lat, lng]) => `${lng},${lat}`).join(";");
    try {
      const res = await fetch(`${OSRM}/route/v1/driving/${path}?${q}`);
      const data = await res.json();
      if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates?.length) {
        return data.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
      }
    } catch {
      /* fall through to legs */
    }
  }

  let merged = [];
  for (let i = 0; i < waypointsLatLng.length - 1; i += 1) {
    const g = await fetchLeg(waypointsLatLng[i], waypointsLatLng[i + 1]);
    if (!g) return merged.length >= 2 ? merged : null;
    merged = mergeGeoPaths(merged, g);
  }
  return merged.length >= 2 ? merged : null;
}

/** Snap scribble: OSRM match (wide radius) then route fallback. */
async function snapFreehandToRoads(latLngPairs) {
  const sampled = resampleLatLngPath(latLngPairs, 48);
  if (!sampled || sampled.length < 2) return sampled;
  const n = sampled.length;
  const coordPath = sampled.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const qs = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "false",
    radiuses: Array(n).fill("55").join(";"),
  });
  try {
    const res = await fetch(`${OSRM}/match/v1/driving/${coordPath}?${qs.toString()}`);
    const data = await res.json();
    if (data.code === "Ok" && Array.isArray(data.matchings) && data.matchings.length) {
      const merged = [];
      for (const m of data.matchings) {
        const coords = m.geometry?.coordinates;
        if (!coords?.length) continue;
        for (const c of coords) merged.push([c[1], c[0]]);
      }
      if (merged.length >= 2) return merged;
    }
  } catch {
    /* fall through */
  }
  const road = await osrmRoadThrough([sampled[0], sampled[sampled.length - 1]]);
  return road || sampled;
}

function TrafficDrawHandler({ enabled, onStrokeComplete }) {
  const map = useMap();
  const previewRef = useRef(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef([]);

  useEffect(() => {
    const el = map.getContainer();
    if (enabled) el.style.cursor = "crosshair";
    else el.style.cursor = "";
    return () => {
      el.style.cursor = "";
    };
  }, [enabled, map]);

  useEffect(() => {
    if (!enabled) {
      drawingRef.current = false;
      pointsRef.current = [];
      if (previewRef.current) {
        map.removeLayer(previewRef.current);
        previewRef.current = null;
      }
      return undefined;
    }

    function removePreview() {
      if (previewRef.current) {
        map.removeLayer(previewRef.current);
        previewRef.current = null;
      }
    }

    function syncPreview() {
      const pts = pointsRef.current;
      if (!pts.length) {
        removePreview();
        return;
      }
      if (previewRef.current) previewRef.current.setLatLngs(pts);
      else {
        previewRef.current = L.polyline(pts, {
          color: "#f97316",
          weight: 4,
          dashArray: "6 5",
          opacity: 0.95,
        }).addTo(map);
      }
    }

    function onDown(e) {
      if (e.originalEvent && e.originalEvent.button !== 0) return;
      drawingRef.current = true;
      pointsRef.current = [e.latlng];
      map.dragging.disable();
      map.doubleClickZoom.disable();
      syncPreview();
    }

    function onMove(e) {
      if (!drawingRef.current) return;
      const pts = pointsRef.current;
      const last = pts[pts.length - 1];
      if (last && typeof last.distanceTo === "function" && last.distanceTo(e.latlng) < 4) return;
      pts.push(e.latlng);
      if (pts.length % 4 === 0) syncPreview();
    }

    async function onUp() {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      map.dragging.enable();
      map.doubleClickZoom.enable();
      const raw = pointsRef.current.map((ll) => [ll.lat, ll.lng]);
      pointsRef.current = [];
      syncPreview();
      removePreview();

      if (raw.length < 2) return;
      const snapped = await snapFreehandToRoads(raw);
      if (snapped?.length >= 2) onStrokeComplete(snapped);
    }

    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    map.on("mouseup", onUp);
    map.on("mouseleave", onUp);

    return () => {
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      map.off("mouseup", onUp);
      map.off("mouseleave", onUp);
      removePreview();
      drawingRef.current = false;
      map.dragging.enable();
      map.doubleClickZoom.enable();
    };
  }, [enabled, map, onStrokeComplete]);

  return null;
}

function MapController({ route, locations, recenterTrigger }) {
  const map = useMap();
  useEffect(() => {
    const updateMap = () => {
      map.invalidateSize();
      const coords = route?.map((id) => locations[id]).filter(Boolean) || [];
      if (coords.length > 1) {
        map.fitBounds(coords, { padding: [10, 10], animate: true });
      } else {
        const allCoords = Object.values(locations);
        if (allCoords.length > 0) {
          map.fitBounds(allCoords, { padding: [20, 20], animate: true });
        }
      }
    };
    const timer = setTimeout(updateMap, 300);
    return () => clearTimeout(timer);
  }, [route, locations, map, recenterTrigger]);
  return null;
}

function AnimatedTruck({ routeCoords }) {
  const [truckPos, setTruckPos] = useState(routeCoords[0]);
  const stepRef = useRef(0);
  const segRef = useRef(0);

  useEffect(() => {
    if (!routeCoords || routeCoords.length < 2) return;
    stepRef.current = 0;
    segRef.current = 0;
    setTruckPos(routeCoords[0]);
    const STEPS_PER_SEG = 5;
    const INTERVAL_MS = 7;
    const id = setInterval(() => {
      const seg = stepRef.current;
      if (seg >= routeCoords.length - 1) return clearInterval(id);
      segRef.current += 1;
      const t = segRef.current / STEPS_PER_SEG;
      if (t >= 1) {
        stepRef.current += 1;
        segRef.current = 0;
      }
      const from = routeCoords[stepRef.current];
      const to = routeCoords[Math.min(stepRef.current + 1, routeCoords.length - 1)];
      if (!from || !to) return;
      setTruckPos([
        from[0] + (to[0] - from[0]) * Math.min(t, 1),
        from[1] + (to[1] - from[1]) * Math.min(t, 1),
      ]);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [routeCoords]);

  if (!truckPos) return null;
  return <Marker position={truckPos} icon={makeTruckIcon()} zIndexOffset={1000} />;
}

function MapLegend({ threshold, hasTraffic }) {
  const items = [
    { color: "var(--color-cyan)", label: "Depot" },
    { color: "var(--color-green)", label: `Normal` },
    { color: "#eab308", label: `Warning` },
    { color: "var(--color-red)", label: `Alert` },
    { color: "var(--color-purple)", label: "Route" },
    { color: "#000000", label: "Sensor Failed" },
  ];

  return (
    <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-[1000] glass-panel bg-[var(--color-surface)]/90 px-2 py-1 sm:px-3 sm:py-1.5 border-[var(--color-card-border)] shadow-xl pointer-events-none backdrop-blur-md flex flex-wrap items-center gap-2 sm:gap-4 max-w-[85vw] sm:max-w-none">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5 sm:gap-2">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: i.color, boxShadow: `0 0 5px ${i.color}` }} />
          <span className="text-[8px] sm:text-[9px] font-black text-[var(--color-text)] uppercase tracking-tighter opacity-80">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

function MapCanvas({
  route,
  optimizing,
  statuses,
  locations,
  routeCoords,
  threshold,
  showPredictiveMap,
  predictiveData,
  recenterTrigger,
  isLight,
  trafficStrokes,
  drawTrafficEnabled,
  onAddTrafficStroke,
  sensorHealth,
}) {
  const center = locations["DEPOT_00"] || [12.2730, 76.6200];

  // Dynamic Map URL based on theme
  const tileUrl = isLight
    ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  return (
    <div className="relative w-full h-full min-h-0">
      <MapContainer
        center={center}
        zoom={16}
        className="w-full h-full"
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url={tileUrl} />

        {Array.isArray(trafficStrokes) &&
          trafficStrokes.map((positions, idx) => (
            <Polyline
              key={`traffic-stroke-${idx}`}
              positions={positions}
              pathOptions={{ color: "#ef4444", weight: 5, opacity: 0.9 }}
            />
          ))}

        {drawTrafficEnabled && (
          <TrafficDrawHandler enabled={drawTrafficEnabled} onStrokeComplete={onAddTrafficStroke} />
        )}

        {/* ── Predictive AI Layer ── */}
        {showPredictiveMap && predictiveData && predictiveData.map((p) => {
          if (!p.latitude || !p.longitude) return null;
          const risk = p.spillover_risk;
          const radius = risk > 80 ? 25 : risk > 50 ? 18 : 12;
          const opacity = risk > 80 ? 0.3 : risk > 50 ? 0.2 : 0.15;
          const color = risk > 80 ? "#ff4d4d" : risk > 50 ? "#eab308" : "#00dbe9";
          return (
            <CircleMarker
              key={`pred-${p.bin_id}`}
              center={[p.latitude, p.longitude]}
              radius={radius}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: opacity,
                weight: 1,
                dashArray: "2, 4"
              }}
            >
              <Popup className="custom-popup">
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                  <div
                    className="kinetic-ring"
                    style={{ '--ring-gradient': `conic-gradient(${color} ${p.spillover_risk}%, transparent 0%)` }}
                  />
                  <span className="kinetic-id">BIN_ {parseInt(p.bin_id.replace("BIN_", ""), 10)}</span>
                  <span className="kinetic-value" style={{ fontSize: '10px' }}>Fill: {p.fill_pct ? p.fill_pct.toFixed(0) : 0}%</span>
                  <span className="kinetic-value" style={{ fontSize: '10px' }}>Risk: {p.spillover_risk}%</span>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {Object.values(statuses || {}).map((s) => {
          if (!s?.latitude || !s?.longitude) return null;

          const isDepot = s.bin_id === "DEPOT_00";
          // Get sensor status for this bin
          const sensorItem = sensorHealth?.sensors?.find(sh => sh.bin_id === s.bin_id);
          const sensorStatus = sensorItem?.severity || "OK";

          return (
            <Marker
              key={s.bin_id}
              position={[s.latitude, s.longitude]}
              icon={isDepot ? makeDepotIcon() : makePinIcon(s, threshold, sensorStatus)}
              eventHandlers={{
                mouseover: (e) => e.target.openPopup(),
                mouseout: (e) => e.target.closePopup(),
              }}
            >
              <Popup
                autoClose={false}
                closeOnClick={false}
                closeButton={false}
                offset={[20, -40]}
                className="tablet-popup"
              >
                <div className="tablet-card">
                  <div className="tablet-id">{s.bin_id}</div>

                  {/* Fill */}
                  <div className="tablet-block">
                    <div className="tablet-row">
                      <span>Fill</span>
                      <span>{(s.fill_pct ?? 0).toFixed(0)}%</span>
                    </div>
                    <div className="tablet-bar">
                      <div
                        className="tablet-fill"
                        style={{
                          width: `${s.fill_pct ?? 0}%`,
                          background:
                            (s.fill_pct ?? 0) > 80
                              ? "#ef4444"
                              : (s.fill_pct ?? 0) > 50
                                ? "#eab308"
                                : "#22c55e",
                        }}
                      />
                    </div>
                  </div>

                  {/* Risk */}
                  <div className="tablet-block">
                    <div className="tablet-row">
                      <span>Risk</span>
                      <span>{s.spillover_risk ?? 0}%</span>
                    </div>
                    <div className="tablet-bar">
                      <div
                        className="tablet-fill"
                        style={{
                          width: `${s.spillover_risk ?? 0}%`,
                          background:
                            (s.spillover_risk ?? 0) > 80
                              ? "#ef4444"
                              : (s.spillover_risk ?? 0) > 50
                                ? "#eab308"
                                : "#22c55e",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {routeCoords.length > 1 && (
          <>
            <Polyline positions={routeCoords} pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.85 }} />
            <Polyline positions={routeCoords} pathOptions={{ color: "#2563eb", weight: 12, opacity: 0.12 }} />
            {!optimizing && <AnimatedTruck routeCoords={routeCoords} />}
          </>
        )}

        <MapController route={route} locations={locations} recenterTrigger={recenterTrigger} />
      </MapContainer>

      <MapLegend threshold={threshold} hasTraffic={trafficStrokes?.length > 0} />
    </div>
  );
}

export default function MapView({
  route,
  optimizing,
  statuses,
  threshold = 70,
  showPredictiveMap,
  predictiveData,
  sensorHealth = null,
  trafficStrokes = [],
  drawTrafficEnabled = false,
  onToggleDrawTraffic = () => { },
  onAddTrafficStroke,
  onClearTraffic = () => { },
}) {
  const [expanded, setExpanded] = useState(false);
  const [roadPath, setRoadPath] = useState(null);
  const [recenterCount, setRecenterCount] = useState(0);
  const [isLight, setIsLight] = useState(document.documentElement.getAttribute("data-theme") === "light");

  const locations = buildLocations(statuses);

  const routeGeometryKey = useMemo(() => {
    if (!route?.length) return "";
    const locs = buildLocations(statuses);
    const coords = route.map((id) => locs[id]).filter(Boolean);
    if (coords.length < 2) return "";
    return `${route.join("-")}|${coords.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(";")}`;
  }, [route, statuses]);

  const handleStroke = useCallback(
    (positions) => {
      if (typeof onAddTrafficStroke === "function") onAddTrafficStroke(positions);
    },
    [onAddTrafficStroke]
  );

  // Watch for theme changes from the button in index.html
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsLight(document.documentElement.getAttribute("data-theme") === "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!routeGeometryKey || !route?.length) {
      setRoadPath(null);
      return;
    }
    const locs = buildLocations(statuses);
    const coords = route.map((id) => locs[id]).filter(Boolean);
    if (coords.length < 2) return;

    let cancelled = false;
    (async () => {
      const path = await osrmRoadThrough(coords);
      if (cancelled) return;
      if (path?.length >= 2) setRoadPath(path);
      else setRoadPath(coords);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only routeGeometryKey: refetch OSRM when stop order or bin coords change, not on unrelated status polls.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable fingerprint encodes route + coordinates
  }, [routeGeometryKey]);

  const displayPath = roadPath || (route?.map(id => locations[id]).filter(Boolean) || []);

  const Header = ({ isModal }) => (
    <div className="flex items-center justify-between px-3 py-2 sm:px-5 sm:py-3 bg-[var(--color-surface)] border-b border-[var(--color-card-border)] backdrop-blur-xl shrink-0 gap-2">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="relative flex items-center justify-center shrink-0">
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]"></div>
          <div className="absolute w-2 h-2 rounded-full bg-blue-500 animate-ping opacity-40"></div>
        </div>
        <div className="truncate">
          <h3 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] text-[var(--color-text)] truncate">
            Grid Intelligence
          </h3>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {optimizing && (
          <span className="flex items-center gap-1 sm:gap-2 text-[9px] sm:text-[10px] font-black text-blue-400 uppercase tracking-widest mr-1 sm:mr-2">
            <Navigation size={11} className="animate-pulse" />
            <span className="hidden xs:inline">Pathing...</span>
          </span>
        )}

        {trafficStrokes.length > 0 && (
          <button
            type="button"
            onClick={onClearTraffic}
            className="p-1.5 rounded-md transition-all border border-transparent hover:bg-red-500/10 text-slate-400 hover:text-red-400 group flex items-center gap-1.5 sm:gap-2 sm:pr-3"
            title="Clear all traffic data"
          >
            <Trash2 size={15} className="group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">
              Clear
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleDrawTraffic}
          className={`p-1.5 rounded-md transition-all border border-transparent group flex items-center gap-1.5 sm:gap-2 sm:pr-3 ${drawTrafficEnabled
            ? "bg-red-500/10 text-red-400 hover:bg-red-500/15"
            : "hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 hover:text-[var(--color-text)]"
            }`}
          title={drawTrafficEnabled ? "Stop drawing traffic" : "Draw traffic on map"}
        >
          <Brush size={15} className="group-hover:scale-110 transition-transform" />
          <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">
            Draw traffic
            {drawTrafficEnabled ? " · On" : ""}
          </span>
        </button>

        <button
          onClick={() => setRecenterCount(v => v + 1)}
          className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-all text-slate-400 hover:text-[var(--color-text)] border border-transparent group flex items-center gap-1.5 sm:gap-2 sm:pr-3"
          title="Recenter Map"
        >
          <LocateFixed size={15} className="group-hover:scale-110 transition-transform" />
          <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">Recenter</span>
        </button>

        <button
          onClick={() => setExpanded(!isModal)}
          className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-all text-slate-400 hover:text-[var(--color-text)] border border-transparent"
        >
          {isModal ? <X size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="glass-panel flex flex-col overflow-hidden h-full border-[var(--color-card-border)] shadow-2xl">
        <Header isModal={false} />
        <div className="flex-1 relative">
          <MapCanvas
            route={route}
            optimizing={optimizing}
            statuses={statuses}
            locations={locations}
            routeCoords={displayPath}
            threshold={threshold}
            showPredictiveMap={showPredictiveMap}
            predictiveData={predictiveData}
            recenterTrigger={recenterCount}
            isLight={isLight}
            trafficStrokes={trafficStrokes}
            drawTrafficEnabled={drawTrafficEnabled}
            onAddTrafficStroke={handleStroke}
            sensorHealth={sensorHealth}
          />
        </div>
      </div>

      {expanded && createPortal(
        <div className="fixed inset-0 z-[9999] bg-[var(--color-bg)]/95 backdrop-blur-xl p-6 flex flex-col">
          <div className="w-full max-w-[1800px] mx-auto h-full flex flex-col rounded-3xl overflow-hidden border border-[var(--color-card-border)] shadow-2xl">
            <Header isModal={true} />
            <div className="flex-1 relative">
              <MapCanvas
                route={route}
                optimizing={optimizing}
                statuses={statuses}
                locations={locations}
                routeCoords={displayPath}
                threshold={threshold}
                showPredictiveMap={showPredictiveMap}
                predictiveData={predictiveData}
                recenterTrigger={recenterCount}
                isLight={isLight}
                trafficStrokes={trafficStrokes}
                drawTrafficEnabled={drawTrafficEnabled}
                onAddTrafficStroke={handleStroke}
                sensorHealth={sensorHealth}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
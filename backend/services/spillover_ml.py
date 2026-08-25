"""
Gradient boosting regressor fit on synthetic daily fill sequences → next-day spillover risk (0–99).
"""

from __future__ import annotations

import hashlib
from typing import List, Optional

import numpy as np

try:
    from sklearn.ensemble import HistGradientBoostingRegressor
except ImportError:  # pragma: no cover
    HistGradientBoostingRegressor = None  # type: ignore[misc, assignment]

_model: Optional[object] = None


def _synthetic_dataset(n_samples: int = 6000, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    X_rows: List[np.ndarray] = []
    y_vals: List[float] = []
    for _ in range(n_samples):
        trend = rng.uniform(-3.0, 10.0)
        noise = rng.uniform(1.5, 7.5)
        level = rng.uniform(12.0, 85.0)
        series: List[float] = []
        v = float(level)
        for _d in range(7):
            v = float(np.clip(v + trend + rng.normal(0, noise), 0.0, 100.0))
            series.append(v)
        nxt = float(np.clip(series[-1] + trend + rng.normal(0, noise * 1.15), 0.0, 100.0))
        jump = nxt - series[-1]
        raw_risk = (nxt - 52.0) * 1.05 + max(0.0, jump) * 2.4 + rng.normal(0, 7.0)
        y = float(np.clip(raw_risk, 0.0, 99.0))
        s = np.asarray(series, dtype=np.float64)
        row = np.concatenate([s, [np.mean(s), s[-1] - s[0], series[-1]]])
        X_rows.append(row)
        y_vals.append(y)
    return np.vstack(X_rows), np.asarray(y_vals, dtype=np.float64)


import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

import threading
_model_lock = threading.Lock()

def _ensure_model() -> Optional[object]:
    global _model
    if HistGradientBoostingRegressor is None:
        return None
    with _model_lock:
        if _model is None:
            X, y = _synthetic_dataset()
            m = HistGradientBoostingRegressor(
                max_iter=80,
                max_depth=6,
                learning_rate=0.08,
                min_samples_leaf=16,
                random_state=42,
            )
            m.fit(X, y)
            _model = m
    return _model


def _feature_row(bin_id: str, daily_fills: List[float], current_fill: float) -> np.ndarray:
    cur = float(np.clip(current_fill, 0.0, 100.0))
    daily = [float(np.clip(x, 0.0, 100.0)) for x in daily_fills][-28:]
    if len(daily) >= 7:
        s = np.asarray(daily[-7:], dtype=np.float64)
    else:
        pad_n = 7 - len(daily)
        s = np.asarray([cur] * pad_n + daily, dtype=np.float64)
    h = int(hashlib.md5(bin_id.encode()).hexdigest()[:8], 16)
    jitter = ((h % 17) - 8) * 0.08
    cur_adj = float(np.clip(cur + jitter, 0.0, 100.0))
    mean7 = float(np.mean(s))
    slope = float(s[-1] - s[0])
    return np.concatenate([s, [mean7, slope, cur_adj]]).reshape(1, -1)


def predict_next_day_spillover_risk(bin_id: str, daily_fills: List[float], current_fill: float) -> int:
    m = _ensure_model()
    if m is None:
        v = current_fill + 22.0
        return int(np.clip(round(v), 0, 99))
    X = _feature_row(bin_id, daily_fills, current_fill)
    pred = float(m.predict(X)[0])
    return int(np.clip(round(pred), 0, 99))

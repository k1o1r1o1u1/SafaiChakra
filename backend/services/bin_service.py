"""
bin_service.py
==============
Data-access layer for bin readings.
All DB queries are isolated here to keep routers thin.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import Date, cast, func
from sqlalchemy.orm import Session

import models
from schemas import BinUpdateRequest


ALERT_THRESHOLD = float(os.getenv("ALERT_THRESHOLD", 70.0))


def create_reading(db: Session, payload: BinUpdateRequest) -> models.BinReading:
    """Persist a new bin reading or update if it exists, and return the ORM object."""
    is_alert = payload.fill_pct >= ALERT_THRESHOLD

    latest = get_latest_reading(db, payload.bin_id)
    
    lat = payload.latitude if payload.latitude is not None else (latest.latitude if latest else None)
    lon = payload.longitude if payload.longitude is not None else (latest.longitude if latest else None)
    
    # Check if failed status is specified or carry over previous
    sensor_status = payload.sensor_status if payload.sensor_status is not None else (latest.sensor_status if latest else False)

    if latest:
        latest.fill_pct = payload.fill_pct
        latest.distance_cm = payload.distance_cm
        latest.latitude = lat
        latest.longitude = lon
        latest.is_alert = is_alert
        latest.sensor_status = sensor_status
        from sqlalchemy.sql import func
        latest.created_at = func.now()
        db.commit()
        db.refresh(latest)
        return latest

    reading = models.BinReading(
        bin_id      = payload.bin_id,
        fill_pct    = payload.fill_pct,
        distance_cm = payload.distance_cm,
        latitude    = lat,
        longitude   = lon,
        is_alert    = is_alert,
        sensor_status = sensor_status,
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading

def get_latest_reading(db: Session, bin_id: str) -> Optional[models.BinReading]:
    """Return the most recent reading for a given bin, or None."""
    return (
        db.query(models.BinReading)
        .filter(models.BinReading.bin_id == bin_id)
        .order_by(models.BinReading.created_at.desc())
        .first()
    )


def get_history(db: Session, bin_id: str, limit: int = 20) -> List[models.BinReading]:
    """Return the last `limit` readings for a bin, newest first."""
    return (
        db.query(models.BinReading)
        .filter(models.BinReading.bin_id == bin_id)
        .order_by(models.BinReading.created_at.desc())
        .limit(limit)
        .all()
    )


def get_all_bins(db: Session) -> List[str]:
    """Return a de-duplicated list of all known bin IDs."""
    rows = db.query(models.BinReading.bin_id).distinct().all()
    return [r.bin_id for r in rows]


def get_daily_max_fill_series(db: Session, bin_id: str, days: int = 28) -> List[float]:
    """Per calendar day, max(fill_pct) for that bin, oldest → newest."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    day_col = func.date(models.BinReading.created_at)
    q = (
        db.query(day_col, func.max(models.BinReading.fill_pct))
        .filter(models.BinReading.bin_id == bin_id)
        .filter(models.BinReading.created_at >= cutoff)
        .group_by(day_col)
        .order_by(day_col)
    )
    return [float(mx) for _d, mx in q.all()]


def calculate_predictive_risk(db: Session, bin_id: str, current_fill: float) -> int:
    """Next-day spillover risk (0-99) using pure-Python linear regression."""
    if current_fill >= 95:
        return 99
        
    daily = get_daily_max_fill_series(db, bin_id, days=28)
    
    # If we have real historical data, do a pure-Python simple linear regression
    if len(daily) >= 3:
        n = len(daily)
        x_mean = sum(range(n)) / n
        y_mean = sum(daily) / n
        numerator = sum((i - x_mean) * (y - y_mean) for i, y in enumerate(daily))
        denominator = sum((i - x_mean) ** 2 for i in range(n))
        slope = numerator / denominator if denominator != 0 else 0
        predicted = (slope * n) + (y_mean - slope * x_mean)
        # Add 15% padding to the prediction for safety
        return int(max(0, min(99, predicted + 15.0)))

    # Fallback heuristic for the demo if no history is seeded.
    # The user specifically requested some "yellow" bins (around 50% fill)
    # to show a very high predictive risk (>75%).
    if bin_id in ("BIN_03", "BIN_04"):
        return int(min(current_fill + 42.0, 99.0))  # 50% fill + 42 = 92% Risk
        
    # Standard fallback
    return int(min(current_fill + 22.0, 99.0))

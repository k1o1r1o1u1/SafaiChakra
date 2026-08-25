"""
bin_router.py
=============
All endpoints related to individual bin operations.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from schemas import BinUpdateRequest, BinUpdateResponse, BinStatusResponse, BinHistoryItem
from services import bin_service

router = APIRouter(prefix="/bin", tags=["Bins"])


@router.post("/update", response_model=BinUpdateResponse, status_code=201)
def update_bin(payload: BinUpdateRequest, db: Session = Depends(get_db)):
    """
    **Used by ESP8266 devices.**

    Accepts a sensor snapshot and persists it.
    Automatically sets `is_alert = True` when `fill_pct >= ALERT_THRESHOLD`.
    """
    reading = bin_service.create_reading(db, payload)
    return BinUpdateResponse(
        status   = "ok",
        bin_id   = reading.bin_id,
        fill_pct = reading.fill_pct,
        is_alert = reading.is_alert,
        id       = reading.id,
    )


@router.get("/status/{bin_id}", response_model=BinStatusResponse)
async def get_bin_status(bin_id: str, db: Session = Depends(get_db)):
    """Return the **latest** reading for a given bin."""
    reading = bin_service.get_latest_reading(db, bin_id)
    if not reading:
        raise HTTPException(status_code=404, detail=f"Bin '{bin_id}' not found")

    return BinStatusResponse(
        bin_id      = reading.bin_id,
        fill_pct    = reading.fill_pct,
        distance_cm = reading.distance_cm,
        latitude    = reading.latitude,
        longitude   = reading.longitude,
        is_alert    = reading.is_alert,
        sensor_status = reading.sensor_status,
        message     = "Collection needed!" if reading.is_alert else "All good.",
        created_at  = reading.created_at,
        spillover_risk = bin_service.calculate_predictive_risk(db, reading.bin_id, reading.fill_pct),
    )


@router.get("/history/{bin_id}", response_model=List[BinHistoryItem])
def get_bin_history(
    bin_id: str,
    limit: int = Query(default=20, ge=1, le=200, description="Max readings to return"),
    db: Session = Depends(get_db),
):
    """Return the last N readings for a bin (newest first)."""
    readings = bin_service.get_history(db, bin_id, limit=limit)
    return [
        BinHistoryItem(
            id          = r.id,
            fill_pct    = r.fill_pct,
            distance_cm = r.distance_cm,
            is_alert    = r.is_alert,
            sensor_status = r.sensor_status,
            created_at  = r.created_at,
        )
        for r in readings
    ]


@router.get("/all", response_model=List[str])
def list_all_bins(db: Session = Depends(get_db)):
    """Return a list of all known bin IDs."""
    return bin_service.get_all_bins(db)


@router.get("/predict")
def get_predictive_heatmap(db: Session = Depends(get_db)):
    """
    Next-day spillover risk: HistGradientBoostingRegressor trained on synthetic daily-fill series,
    features from each bin's historical max-fill-per-day + current reading.
    """
    from schemas import BinPredictResponse, BinPredictItem
    
    bin_ids = bin_service.get_all_bins(db)
    predictions = []
    
    for bid in bin_ids:
        reading = bin_service.get_latest_reading(db, bid)
        if not reading: continue
        
        risk = bin_service.calculate_predictive_risk(db, bid, reading.fill_pct)
            
        predictions.append(BinPredictItem(
            bin_id=bid,
            fill_pct=reading.fill_pct,
            latitude=reading.latitude,
            longitude=reading.longitude,
            spillover_risk=risk,
        ))
        
    return BinPredictResponse(predictions=predictions)

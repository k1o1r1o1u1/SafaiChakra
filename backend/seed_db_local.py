import os
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
import models
from datetime import datetime, timezone, timedelta

def seed_db():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    
    db: Session = SessionLocal()
    
    # Clear existing
    db.query(models.BinReading).delete()
    
    print("Seeding bins...")
    now = datetime.now(timezone.utc)
    
    bin_data = [
        ("BIN_01", 61.0, 6.1, True, now - timedelta(minutes=5), 12.3167, 76.6140, False),
        ("BIN_02", 25.0, 15.0, False, now - timedelta(minutes=10), 12.2818, 76.6160, False),
        ("BIN_03", 50.0, 30.0, False, now - timedelta(minutes=15), 12.2680, 76.6320, False),
        ("BIN_04", 50.0, 30.0, False, now - timedelta(minutes=20), 12.2900, 76.6400, False),
        ("BIN_05", 87.0, 15.0, True, now - timedelta(minutes=25), 12.2860, 76.6480, False),
        ("BIN_06", 10.0, 30.0, False, now - timedelta(minutes=30), 12.2965, 76.6380, False),
        ("BIN_07", 100.0, 30.0, False, now - timedelta(minutes=35), 12.3010, 76.6230, False),
        ("BIN_08", 87.0, 15.0, True, now - timedelta(minutes=40), 12.3150, 76.6200, False),
        ("BIN_09", 100.0, 30.0, False, now - timedelta(minutes=45), 12.3240, 76.6050, False),
        ("DEPOT_00", 25.0, 30.0, False, now - timedelta(minutes=50), 12.2730, 76.6200, False),
        ("BIN_10", 30.0, 28.0, False, now - timedelta(minutes=55), 12.3310, 76.6130, False),
    ]
    
    for row in bin_data:
        reading = models.BinReading(
            bin_id=row[0],
            fill_pct=row[1],
            distance_cm=row[2],
            is_alert=row[3],
            created_at=row[4],
            latitude=row[5],
            longitude=row[6],
            sensor_status=row[7]
        )
        db.add(reading)
    
    db.commit()
    print("Database seeded successfully with exact snapshot data!")

if __name__ == "__main__":
    seed_db()

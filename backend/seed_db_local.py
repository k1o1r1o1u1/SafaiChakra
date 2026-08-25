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
    bin_data = [
        ("BIN_01", 61.0, 6.1, True, "2026-06-25T03:45:43", 12.3167, 76.6140, True),
        ("BIN_02", 25.0, 15.0, False, "2026-06-24T01:29:29", 12.2818, 76.6160, True),
        ("BIN_03", 50.0, 30.0, False, "2026-06-23T17:06:26", 12.2680, 76.6320, True),
        ("BIN_04", 50.0, 30.0, False, "2026-06-23T17:06:30", 12.2900, 76.6400, True),
        ("BIN_05", 87.0, 15.0, True, "2026-06-24T08:44:48", 12.2860, 76.6480, True),
        ("BIN_06", 10.0, 30.0, False, "2026-06-23T17:06:35", 12.2965, 76.6380, True),
        ("BIN_07", 100.0, 30.0, False, "2026-06-23T17:06:38", 12.3010, 76.6230, True),
        ("BIN_08", 87.0, 15.0, True, "2026-06-23T17:06:40", 12.3150, 76.6200, True),
        ("BIN_09", 100.0, 30.0, False, "2026-06-23T17:06:43", 12.3240, 76.6050, True),
        ("DEPOT_00", 25.0, 30.0, False, "2026-06-03T16:34:28", 12.2730, 76.6200, True),
        ("BIN_10", 30.0, 28.0, False, "2026-06-23T17:06:46", 12.3310, 76.6130, True),
    ]
    
    for row in bin_data:
        reading = models.BinReading(
            bin_id=row[0],
            fill_pct=row[1],
            distance_cm=row[2],
            is_alert=row[3],
            created_at=datetime.strptime(row[4], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc),
            latitude=row[5],
            longitude=row[6],
            sensor_status=row[7]
        )
        db.add(reading)
    
    db.commit()
    print("Database seeded successfully with exact snapshot data!")

if __name__ == "__main__":
    seed_db()

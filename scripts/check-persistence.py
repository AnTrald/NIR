"""Manual stage-1 persistence probe; run inside the backend container."""

import argparse

from sqlalchemy import text

from app.core.config import Settings
from app.db.session import create_database_engine


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["seed", "verify"])
    action = parser.parse_args().action
    engine = create_database_engine(Settings())
    try:
        with engine.begin() as connection:
            if action == "seed":
                # Deliberately fail if the probe already exists; never overwrite it.
                connection.execute(text("CREATE TABLE stage1_persistence_probe (value text NOT NULL)"))
                connection.execute(
                    text("INSERT INTO stage1_persistence_probe (value) VALUES (:value)"),
                    {"value": "web-notebook-stage-1"},
                )
            else:
                value = connection.execute(text("SELECT value FROM stage1_persistence_probe")).scalar_one()
                if value != "web-notebook-stage-1":
                    raise RuntimeError("Persistence probe has unexpected content")
                connection.execute(text("DROP TABLE stage1_persistence_probe"))
        print("Persistence probe seeded" if action == "seed" else "Persistence verified; probe removed")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()

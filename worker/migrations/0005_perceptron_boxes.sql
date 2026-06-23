-- Edge devices that poll local IP cameras and upload snapshots
CREATE TABLE perceptron_boxes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  device_token_hash TEXT NOT NULL,
  poll_interval_seconds INTEGER NOT NULL DEFAULT 60 CHECK (poll_interval_seconds >= 10),
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_perceptron_boxes_user_id ON perceptron_boxes(user_id);
CREATE UNIQUE INDEX idx_perceptron_boxes_device_token_hash ON perceptron_boxes(device_token_hash);

ALTER TABLE cameras ADD COLUMN perceptron_box_id TEXT REFERENCES perceptron_boxes(id) ON DELETE SET NULL;

CREATE INDEX idx_cameras_perceptron_box_id ON cameras(perceptron_box_id);

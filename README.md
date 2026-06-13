# Friday — Hand Gesture Control System

Friday's Hand Gesture Control System is a high-performance, low-latency, and modular gesture controller written from scratch in Python. It features a multi-threaded architecture that isolates camera frame acquisition, MediaPipe landmark classification, and UI rendering to ensure jitter-free cursor tracking with minimum CPU load (<15%).

---

## 🖐️ Gesture Map

| Gesture | Hand Posture | Action | Cooldown |
| :--- | :--- | :--- | :--- |
| **Move Mouse** | ☝️ Index finger extended | Moves the cursor smoothly (using EMA filtering) | None |
| **Left Click** | 🤏 Pinch (Index + Thumb tips <30px) | Single left mouse click | 0.4 seconds |
| **Scroll Page** | ✌️ Index + Middle fingers extended | Scrolls page vertically based on vertical movement | None |
| **Right Click** | ✊ Fist (All fingers folded down) | Single right mouse click | 0.5 seconds |
| **Drag & Drop** | ✋ Open Palm (All 5 fingers extended) | Holds left button down to drag, releases on posture change | None |
| **Screenshot** | 🖐️ Index + Middle + Ring fingers up | Captures screen and saves file to `screenshots/` | 1.5 seconds |

---

## 🛠️ Setup in 5 Steps

1. **Verify Python Installation**
   Ensure Python 3.8+ is installed on your Windows machine by running:
   ```cmd
   python --version
   ```

2. **Install Dependencies**
   Open a command prompt inside the `Friday` directory and run:
   ```cmd
   pip install -r requirements.txt
   ```

3. **Configure Camera Index (Optional)**
   If you have multiple webcams (e.g., built-in webcam and virtual/phone webcams like Iriun), open `config.py` and change the `CAMERA_INDEX` (default is `0`):
   ```python
   CAMERA_INDEX = 0  # 0 for default built-in camera, 1 or 2 for external cameras
   ```

4. **Run the Controller**
   Double-click the **`run.bat`** file at the root of the workspace directory (or run `python gesture_control.py` in your terminal).

5. **Interact with the Floating HUD**
   Keep the **Friday — Hand Gesture Control** window active to toggle features using keyboard hotkeys or directly click the virtual buttons on the right-hand panel of the OpenCV window.

---

## 🎨 Interactive HUD & Controls

### Keyboard Hotkeys (Focus HUD Window first):
- **`C`** — Toggle camera feed ON/OFF (releases webcam resource dynamically)
- **`P`** — Toggle gesture processing pause (cursor movement stops, landmarks are still drawn)
- **`Q`** — Quit program safely

### Virtual Buttons (Click directly inside the OpenCV HUD Sidebar):
- **`CAM`** — Toggle webcam feed ON/OFF
- **`PAUSE / RESUME`** — Toggle active cursor control
- **`QUIT CONTROL`** — Exit the controller

### Color-Coded Status Feedback:
- **Green Border** = Gesture confirmed and actively firing action.
- **Yellow Border** = Gesture detected, currently filling confirmation buffer (held for 3 frames).
- **Gray Border** = No hand detected / Camera paused.

---

## ⚙️ Core Parameters (`config.py`)

All settings can be customized in `config.py`:
- `SMOOTH_ALPHA` (default `0.3`): Control mouse smoothing. Lower is smoother, higher is more responsive.
- `DEADZONE_PX` (default `5`): Ignores movements smaller than 5 pixels to stop camera static/hand micro-jitter from vibrating the cursor.
- `CONFIRMATION_FRAMES` (default `3`): Number of consecutive frames a gesture must be active before triggering, preventing misclassifications.
- `FRAME_SKIP` (default `2`): Process every 2nd frame. Set to `1` for maximum sensitivity, or higher (e.g., `3`) to reduce CPU usage further.

---

## 🔍 Troubleshooting

- **Webcam feed is black or shows wrong camera:**
  Change `CAMERA_INDEX` in `config.py` (try values `0`, `1`, `2`, or `3`). Close any other applications using your webcam (like Zoom, Teams, or browser tabs).
- **Cursor does not reach the edges of the screen:**
  Adjust `X_MIN`, `X_MAX`, `Y_MIN`, `Y_MAX` in `config.py` to shrink the active bounding box. A smaller box means you have to move your hand less to span the entire desktop screen.
- **Mouse clicks are not firing:**
  Ensure the console window was opened as a normal user (or administrator if you are trying to control administrator-level system apps). PyAutoGUI requires focus privileges to inject clicks into other active windows.

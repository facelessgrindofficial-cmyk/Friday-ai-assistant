# ui_overlay.py
import cv2
import numpy as np
import config

class UIOverlay:
    def __init__(self, interaction_callback_params):
        self.window_name = "Friday - Hand Gesture Control"
        cv2.namedWindow(self.window_name, cv2.WINDOW_AUTOSIZE)
        
        # Keep window on top natively using OpenCV
        try:
            cv2.setWindowProperty(self.window_name, cv2.WND_PROP_TOPMOST, 1)
        except Exception:
            pass  # Some OpenCV builds might not fully support this property on all platforms
            
        # Register mouse callback to handle clicks on buttons
        cv2.setMouseCallback(self.window_name, self.handle_mouse_click, interaction_callback_params)

    def handle_mouse_click(self, event, x, y, flags, params):
        """
        Check if mouse click happened inside any of our button boundaries.
        """
        if event == cv2.EVENT_LBUTTONDOWN:
            # 1. CAM ON/OFF button: x in [660, 745], y in [350, 380]
            if 660 <= x <= 745 and 350 <= y <= 380:
                params['toggle_cam'] = True
                
            # 2. PAUSE button: x in [755, 835], y in [350, 380]
            elif 755 <= x <= 835 and 350 <= y <= 380:
                params['toggle_pause'] = True
                
            # 3. QUIT button: x in [660, 835], y in [400, 430]
            elif 660 <= x <= 835 and 400 <= y <= 430:
                params['quit'] = True

    def draw_ui(self, frame, gesture, state, fps, cpu_percent, cam_on, paused, hand_count):
        """
        Renders the complete 850x480 canvas with the camera feed and sidebar.
        """
        # Create empty base canvas
        canvas = np.zeros((480, 850, 3), dtype=np.uint8)
        
        # 1. Build Left Side (Camera Feed - 640x480)
        if cam_on:
            if frame is not None:
                cam_frame = frame.copy()
            else:
                cam_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(cam_frame, "Camera Source Error", (150, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        else:
            cam_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            # Draw Cam Paused Screen
            cv2.putText(cam_frame, "[Camera Paused]", (180, 220), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)
            cv2.putText(cam_frame, "Click CAM button or press 'C' to resume", (140, 260), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (170, 170, 170), 1)

        # Draw Active Zone bounds if camera is active
        if cam_on and frame is not None:
            x_min_px = int(config.X_MIN * config.FRAME_WIDTH)
            x_max_px = int(config.X_MAX * config.FRAME_WIDTH)
            y_min_px = int(config.Y_MIN * config.FRAME_HEIGHT)
            y_max_px = int(config.Y_MAX * config.FRAME_HEIGHT)
            
            cv2.rectangle(cam_frame, (x_min_px, y_min_px), (x_max_px, y_max_px), (255, 255, 0), 1)
            cv2.putText(cam_frame, "ACTIVE ZONE", (x_min_px + 5, y_min_px - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0), 1)

        # Draw feedback border depending on tracking status
        border_color = (128, 128, 128)  # Gray: No Hand
        if not cam_on or paused:
            border_color = (50, 50, 50)
        elif state == "CONFIRMED":
            border_color = (0, 255, 0)      # Green: Confirmed & Firing
        elif state == "BUFFERING":
            border_color = (0, 255, 255)    # Yellow: Detected & Buffering
            
        cv2.rectangle(cam_frame, (0, 0), (640, 480), border_color, 8)
        
        # Copy camera frame to left portion of canvas
        canvas[0:480, 0:640] = cam_frame
        
        # 2. Build Right Side Sidebar (210x480)
        canvas[0:480, 640:850] = (30, 30, 30)  # Charcoal Background
        
        # Separator line
        cv2.line(canvas, (640, 0), (640, 480), (70, 70, 70), 2)
        
        # Title Header
        cv2.putText(canvas, "🟢 FRIDAY OS", (660, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        cv2.putText(canvas, "Gesture Control", (660, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)
        
        # Gesture Status Box
        cv2.rectangle(canvas, (655, 80), (835, 185), (45, 45, 45), -1)
        cv2.rectangle(canvas, (655, 80), (835, 185), (80, 80, 80), 1)
        
        # Map gesture codes to user friendly names
        gesture_labels = {
            "MOVE": "☝️ MOVE MOUSE",
            "PINCH": "🤏 LEFT CLICK",
            "SCROLL": "✌️ SCROLL",
            "FIST": "✊ RIGHT CLICK",
            "OPEN_PALM": "✋ DRAG & DROP",
            "SCREENSHOT": "🖐️ SCREENSHOT",
            "IDLE": "💤 IDLE",
            "NONE": "❌ NONE"
        }
        
        # Determine status details
        status_text = "❌ No Hand"
        status_color = (128, 128, 128)
        label_color = (255, 255, 255)
        
        if paused:
            status_text = "⏸️ Paused"
            status_color = (0, 165, 255)
            gesture_display = "⏸️ PAUSED"
        elif not cam_on:
            status_text = "📷 Cam Off"
            status_color = (100, 100, 100)
            gesture_display = "📷 CAM OFF"
        else:
            gesture_display = gesture_labels.get(gesture, "💤 IDLE")
            if state == "CONFIRMED":
                status_text = "✅ Active"
                status_color = (0, 255, 0)
                label_color = (0, 255, 0)
            elif state == "BUFFERING":
                status_text = "⏳ Buffering"
                status_color = (0, 255, 255)
                label_color = (0, 255, 255)
                
        cv2.putText(canvas, "CURRENT GESTURE:", (665, 105), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (160, 160, 160), 1)
        cv2.putText(canvas, gesture_display, (665, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.6, label_color, 2)
        cv2.putText(canvas, status_text, (665, 170), cv2.FONT_HERSHEY_SIMPLEX, 0.45, status_color, 1)
        
        # System status readings
        cv2.putText(canvas, f"CPU: {cpu_percent:.1f}%", (660, 220), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        cv2.putText(canvas, f"FPS: {int(fps)}", (660, 245), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        cv2.putText(canvas, f"Hands: {hand_count} detected", (660, 270), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        
        # Interactive Buttons
        # 1. CAM Toggle Button
        cam_btn_color = (40, 150, 40) if cam_on else (40, 40, 150)
        cv2.rectangle(canvas, (660, 350), (745, 380), cam_btn_color, -1)
        cv2.rectangle(canvas, (660, 350), (745, 380), (255, 255, 255), 1)
        cv2.putText(canvas, "CAM [C]", (673, 368), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)
        
        # 2. PAUSE Toggle Button
        pause_btn_color = (40, 40, 150) if paused else (150, 100, 40)
        cv2.rectangle(canvas, (755, 350), (835, 380), pause_btn_color, -1)
        cv2.rectangle(canvas, (755, 350), (835, 380), (255, 255, 255), 1)
        pause_btn_text = "RESUME" if paused else "PAUSE [P]"
        cv2.putText(canvas, pause_btn_text, (765, 368), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)
        
        # 3. QUIT Button
        cv2.rectangle(canvas, (660, 400), (835, 430), (40, 40, 180), -1)
        cv2.rectangle(canvas, (660, 400), (835, 430), (255, 255, 255), 1)
        cv2.putText(canvas, "QUIT CONTROL [Q]", (685, 420), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        
        # Render frame
        cv2.imshow(self.window_name, canvas)

    def close(self):
        cv2.destroyAllWindows()

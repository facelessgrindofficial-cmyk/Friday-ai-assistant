import cv2
import mediapipe as mp
import pyautogui
import time
import json
import os
import sys
import math

# Prevent PyAutoGUI exceptions and delays
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0

SETTINGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gesture_settings.json")

# Default settings
settings = {
    "camera_index": 0,
    "pinch_threshold": 0.15,
    "min_smooth_factor": 0.10,
    "max_smooth_factor": 0.45,
    "x_min": 0.20,
    "x_max": 0.80,
    "y_min": 0.20,
    "y_max": 0.70,
    "show_preview": True
}

def load_settings():
    global settings
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                loaded = json.load(f)
                settings.update(loaded)
        except Exception as e:
            print(f"Error loading settings: {e}")
    else:
        save_settings()

def save_settings():
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(settings, f, indent=4)
    except Exception as e:
        print(f"Error saving settings: {e}")

load_settings()

screen_width, screen_height = pyautogui.size()
print(f"Screen resolution detected: {screen_width}x{screen_height}")
print("Loading MediaPipe Hands...")

# Initialize MediaPipe Hands
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    model_complexity=0,  # 0 is the fastest model, minimizing CPU usage
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# Gesture control state variables
left_clicked = False
right_clicked = False
is_dragging = False
prev_scroll_y = None
prev_target_x, prev_target_y = None, None
prev_smooth_x, prev_smooth_y = None, None

def get_finger_states(landmarks):
    """
    Check if the four main fingers are extended (UP) or folded (DOWN).
    y-coordinates in MediaPipe go from 0 (top) to 1 (bottom).
    """
    states = {
        "index": landmarks[8].y < landmarks[6].y,
        "middle": landmarks[12].y < landmarks[10].y,
        "ring": landmarks[16].y < landmarks[14].y,
        "pinky": landmarks[20].y < landmarks[18].y
    }
    return states

def get_screen_coords(x, y):
    """
    Map normalized webcam coordinates to screen dimensions using the bounding box.
    Webcam feed is flipped horizontally, so x needs to be inverted.
    """
    # Flip horizontal coordinate since the frame is mirrored
    x_mirrored = 1.0 - x
    
    x_min, x_max = settings["x_min"], settings["x_max"]
    y_min, y_max = settings["y_min"], settings["y_max"]
    
    # Scale coordinates relative to bounding box
    scaled_x = (x_mirrored - x_min) / (x_max - x_min)
    scaled_y = (y - y_min) / (y_max - y_min)
    
    # Clamp to [0, 1] range
    scaled_x = max(0.0, min(1.0, scaled_x))
    scaled_y = max(0.0, min(1.0, scaled_y))
    
    # Map to screen pixels
    screen_x = int(scaled_x * screen_width)
    screen_y = int(scaled_y * screen_height)
    
    return screen_x, screen_y

def main():
    global left_clicked, right_clicked, is_dragging, prev_scroll_y
    global prev_target_x, prev_target_y, prev_smooth_x, prev_smooth_y
    
    camera_index = settings["camera_index"]
    print(f"Opening camera index: {camera_index}")
    cap = cv2.VideoCapture(camera_index)
    
    if not cap.isOpened():
        print(f"Failed to open camera index {camera_index}. Falling back to index 0.")
        camera_index = 0
        settings["camera_index"] = 0
        save_settings()
        cap = cv2.VideoCapture(camera_index)
        if not cap.isOpened():
            print("No cameras available. Please connect a webcam.")
            sys.exit(1)
            
    # Set webcam resolution to 640x480 for fast processing (lower CPU!)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    print("\nFriday Gesture Control System initialized successfully!")
    print("Controls:")
    print("  • Index finger up = Move cursor")
    print("  • Pinch (index + thumb) = Left click")
    print("  • Two fingers up = Scroll up/down")
    print("  • Fist = Right click")
    print("  • Open palm = Drag & Drop (hold down & move)")
    print("\nKeyboard Hotkeys (press inside the preview window):")
    print("  • [C] - Cycle to next webcam camera index")
    print("  • [H] - Toggle hiding/showing the preview window (runs in background for minimum CPU)")
    print("  • [Q] - Quit gesture controller")
    
    last_frame_time = time.time()
    
    while True:
        # Limit loop speed to match webcam frame rate (~30fps) to avoid pinning CPU
        current_time = time.time()
        elapsed = current_time - last_frame_time
        if elapsed < 0.033:
            time.sleep(0.033 - elapsed)
            
        last_frame_time = time.time()
        
        success, frame = cap.read()
        if not success:
            continue
            
        # Flip the frame horizontally to present mirrored view
        frame = cv2.flip(frame, 1)
        h, w, _ = frame.shape
        
        # Resize to 640x480 if frame is larger, keeping processing overhead low
        if w > 640 or h > 480:
            frame = cv2.resize(frame, (640, 480))
            h, w, _ = frame.shape
            
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb_frame)
        
        gesture = "NONE"
        status_msg = "No Hand Detected"
        pinch_dist_display = 0.0
        
        if results.multi_hand_landmarks:
            status_msg = "Hand Tracked"
            landmarks = results.multi_hand_landmarks[0].landmark
            
            # Calculate hand scale/size (distance from Wrist (0) to Middle MCP (9))
            wrist = landmarks[0]
            middle_mcp = landmarks[9]
            hand_size = math.sqrt((wrist.x - middle_mcp.x)**2 + (wrist.y - middle_mcp.y)**2 + (wrist.z - middle_mcp.z)**2)
            if hand_size == 0:
                hand_size = 0.001
                
            # Get states of major fingers
            finger_states = get_finger_states(landmarks)
            
            # Pinch distance (Index tip to Thumb tip)
            thumb_tip = landmarks[4]
            index_tip = landmarks[8]
            raw_pinch_dist = math.sqrt((thumb_tip.x - index_tip.x)**2 + (thumb_tip.y - index_tip.y)**2 + (thumb_tip.z - index_tip.z)**2)
            pinch_dist_display = raw_pinch_dist / hand_size
            
            is_pinched = pinch_dist_display < settings["pinch_threshold"]
            
            # Determine Gesture type
            if is_pinched:
                gesture = "LEFT_CLICK"
            elif finger_states["index"] and finger_states["middle"] and finger_states["ring"] and finger_states["pinky"]:
                gesture = "DRAG"
            elif finger_states["index"] and finger_states["middle"] and not finger_states["ring"] and not finger_states["pinky"]:
                gesture = "SCROLL"
            elif finger_states["index"] and not finger_states["middle"] and not finger_states["ring"] and not finger_states["pinky"]:
                gesture = "MOVE"
            elif not finger_states["index"] and not finger_states["middle"] and not finger_states["ring"] and not finger_states["pinky"]:
                gesture = "RIGHT_CLICK"
            else:
                gesture = "IDLE"
                
            # --- Execute Gesture Actions ---
            
            # 1. Left Click (Pinch)
            if gesture == "LEFT_CLICK":
                if not left_clicked:
                    pyautogui.click()
                    left_clicked = True
            else:
                left_clicked = False
                
            # 2. Right Click (Fist)
            if gesture == "RIGHT_CLICK":
                if not right_clicked:
                    pyautogui.rightClick()
                    right_clicked = True
            else:
                right_clicked = False
                
            # 3. Drag & Drop (Open Palm)
            if gesture == "DRAG":
                if not is_dragging:
                    pyautogui.mouseDown()
                    is_dragging = True
            else:
                if is_dragging:
                    pyautogui.mouseUp()
                    is_dragging = False
                    
            # 4. Scroll (Index + Middle Up)
            if gesture == "SCROLL":
                current_scroll_y = index_tip.y
                if prev_scroll_y is not None:
                    dy = current_scroll_y - prev_scroll_y
                    if abs(dy) > 0.015:
                        # Scroll direction is reversed (moving down increases y, which should scroll down)
                        scroll_amount = -int(dy * 2500)
                        pyautogui.scroll(scroll_amount)
                        prev_scroll_y = current_scroll_y
                else:
                    prev_scroll_y = current_scroll_y
            else:
                prev_scroll_y = None
                
            # 5. Move Mouse (Index Up) or Drag (Open Palm)
            if gesture in ["MOVE", "DRAG"]:
                target_x, target_y = get_screen_coords(index_tip.x, index_tip.y)
                
                # Check for dynamic smoothing
                if prev_target_x is None:
                    prev_target_x, prev_target_y = target_x, target_y
                    prev_smooth_x, prev_smooth_y = pyautogui.position()
                    
                # Calculate movement velocity/distance
                target_dist = math.sqrt((target_x - prev_target_x)**2 + (target_y - prev_target_y)**2)
                
                # Dynamic smooth factor: slower hand movement = higher smoothing (lower factor), faster = instant catchup
                min_sf = settings["min_smooth_factor"]
                max_sf = settings["max_smooth_factor"]
                
                # Distance threshold for maximum speed (e.g., 200 pixels)
                scale_dist = min(target_dist / 200.0, 1.0)
                smooth_factor = min_sf + (max_sf - min_sf) * scale_dist
                
                # Apply exponential smoothing
                smooth_x = int(prev_smooth_x + (target_x - prev_smooth_x) * smooth_factor)
                smooth_y = int(prev_smooth_y + (target_y - prev_smooth_y) * smooth_factor)
                
                pyautogui.moveTo(smooth_x, smooth_y)
                
                prev_target_x, prev_target_y = target_x, target_y
                prev_smooth_x, prev_smooth_y = smooth_x, smooth_y
            else:
                # Reset target caching when hand stops moving mouse
                prev_target_x, prev_target_y = None, None
                prev_smooth_x, prev_smooth_y = None, None
                
        # Drawing preview HUD
        if settings["show_preview"]:
            # Draw bounding box (interaction area)
            cv2.rectangle(
                frame,
                (int(settings["x_min"] * w), int(settings["y_min"] * h)),
                (int(settings["x_max"] * w), int(settings["y_max"] * h)),
                (0, 255, 255),
                1
            )
            cv2.putText(
                frame, "ACTIVE INTERACTION ZONE",
                (int(settings["x_min"] * w) + 5, int(settings["y_min"] * h) - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1
            )
            
            # Draw hand landmarks if detected
            if results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(
                    frame,
                    results.multi_hand_landmarks[0],
                    mp_hands.HAND_CONNECTIONS,
                    mp_drawing_styles.get_default_hand_landmarks_style(),
                    mp_drawing_styles.get_default_hand_connections_style()
                )
                
            # Draw HUD Background panel
            cv2.rectangle(frame, (10, 10), (280, 120), (20, 20, 20), -1)
            cv2.rectangle(frame, (10, 10), (280, 120), (59, 130, 246), 1)
            
            # HUD details
            cv2.putText(frame, f"STATUS: {status_msg}", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0) if results.multi_hand_landmarks else (0, 0, 255), 1)
            cv2.putText(frame, f"GESTURE: {gesture}", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(frame, f"PINCH DIST: {pinch_dist_display:.3f}", (20, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255) if is_pinched else (255, 255, 255), 1)
            cv2.putText(frame, f"CAMERA INDEX: {camera_index}", (20, 105), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)
            
            # Footer controls
            cv2.putText(frame, "[C] Camera | [H] Hide | [Q] Quit", (15, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
            
            # Show preview window
            cv2.imshow("Friday Gesture Control HUD", frame)
            
        key = cv2.waitKey(1) & 0xFF
        
        # Hotkey [Q] - Quit
        if key == ord('q'):
            print("Exiting Gesture Controller...")
            break
            
        # Hotkey [H] - Hide preview window (run completely in background)
        elif key == ord('h'):
            settings["show_preview"] = not settings["show_preview"]
            save_settings()
            if not settings["show_preview"]:
                cv2.destroyAllWindows()
                print("Preview window hidden. Running in low-CPU background mode. Press Ctrl+C in terminal or close script to exit.")
            else:
                print("Showing preview window.")
                
        # Hotkey [C] - Cycle camera index
        elif key == ord('c'):
            camera_index = (camera_index + 1) % 4
            print(f"Switching camera to index: {camera_index}")
            cap.release()
            cv2.destroyAllWindows()
            cap = cv2.VideoCapture(camera_index)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            settings["camera_index"] = camera_index
            save_settings()
            
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()

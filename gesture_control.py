# gesture_control.py
import threading
import queue
import time
import cv2
import psutil
import config
from gesture_detector import GestureDetector
from mouse_controller import MouseController
from ui_overlay import UIOverlay

# Thread-safe queues for frame communication
raw_frame_queue = queue.Queue(maxsize=1)
ui_queue = queue.Queue(maxsize=1)

# Central control flags shared across threads
state_params = {
    'cam_on': True,
    'paused': False,
    'running': True,
    'toggle_cam': False,
    'toggle_pause': False,
    'quit': False
}

def camera_capture_thread(params, frame_queue):
    """
    Thread 1: Background Camera Capture Thread.
    Continuously acquires frames from the webcam, mirrors them, and pushes to the processing queue.
    """
    cap = None
    last_cam_state = False
    
    while params['running']:
        current_cam_state = params['cam_on']
        
        # Open or close camera dynamically based on UI state
        if current_cam_state != last_cam_state:
            if current_cam_state:
                print(f"[SYSTEM] Opening camera index: {config.CAMERA_INDEX}...")
                cap = cv2.VideoCapture(config.CAMERA_INDEX)
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.FRAME_WIDTH)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.FRAME_HEIGHT)
            else:
                if cap is not None:
                    print("[SYSTEM] Closing camera connection...")
                    cap.release()
                    cap = None
            last_cam_state = current_cam_state
            
        if current_cam_state and cap is not None and cap.isOpened():
            try:
                ret, frame = cap.read()
                if ret:
                    # Mirror the frame horizontally so it feels natural
                    frame = cv2.flip(frame, 1)
                    
                    # Empty the queue if full to guarantee zero frame lag
                    if frame_queue.full():
                        try:
                            frame_queue.get_nowait()
                        except queue.Empty:
                            pass
                    frame_queue.put(frame)
            except Exception as e:
                print(f"[ERROR] Camera read failure: {e}")
                time.sleep(0.5)
        else:
            time.sleep(0.1)
            
    if cap is not None:
        cap.release()
    print("[SYSTEM] Camera capture thread terminated.")


def gesture_processing_thread(params, frame_queue, ui_queue):
    """
    Thread 2: Background Gesture Processing Thread.
    Processes webcam frames through MediaPipe, computes finger states, and controls the cursor/clicks.
    """
    detector = GestureDetector()
    mouse = MouseController()
    
    # Click Action cooldown tracking
    last_left_click = 0.0
    last_right_click = 0.0
    last_screenshot = 0.0
    
    prev_scroll_y = None
    frame_count = 0
    last_time = time.time()
    fps = 30.0
    
    while params['running']:
        if not params['cam_on']:
            time.sleep(0.1)
            continue
            
        try:
            # Wait for frame with timeout to prevent thread blocking on shutdown
            frame = frame_queue.get(timeout=0.2)
        except queue.Empty:
            continue
            
        frame_count += 1
        
        # Performance: Skip frames to save CPU load
        if frame_count % config.FRAME_SKIP != 0:
            if ui_queue.full():
                try:
                    ui_queue.get_nowait()
                except queue.Empty:
                    pass
            ui_queue.put((frame, detector.last_confirmed_gesture, "BUFFERING", 0, fps))
            continue
            
        # Detect hands and process posture
        results = detector.process_frame(frame)
        
        hand_count = 0
        gesture = "NONE"
        state = "NO_HAND"
        landmarks = None
        
        if results.multi_hand_landmarks:
            hand_count = len(results.multi_hand_landmarks)
            gesture, state, landmarks = detector.get_confirmed_gesture(results)
            
            # Annotate skeleton overlay
            detector.draw_landmarks(frame, results)
            
            # Execute cursor control commands if NOT paused and gesture is confirmed
            if not params['paused'] and state == "CONFIRMED":
                now = time.time()
                
                # 1. Left Click (Pinch)
                if gesture == "PINCH":
                    if now - last_left_click > config.LEFT_CLICK_COOLDOWN:
                        mouse.left_click()
                        last_left_click = now
                        
                # 2. Right Click (Fist)
                elif gesture == "FIST":
                    if now - last_right_click > config.RIGHT_CLICK_COOLDOWN:
                        mouse.right_click()
                        last_right_click = now
                        
                # 3. Screenshot (3 fingers UP)
                elif gesture == "SCREENSHOT":
                    if now - last_screenshot > config.SCREENSHOT_COOLDOWN:
                        mouse.take_screenshot()
                        last_screenshot = now
                        
                # 4. Drag & Drop (Open Palm)
                if gesture == "OPEN_PALM":
                    mouse.start_drag()
                    index_tip = landmarks[8]
                    target_x, target_y = map_coordinates(index_tip.x, index_tip.y)
                    mouse.move_to(target_x, target_y)
                else:
                    mouse.stop_drag()
                    
                # 5. Scroll (Index + Middle UP)
                if gesture == "SCROLL":
                    index_tip = landmarks[8]
                    current_y = index_tip.y * config.FRAME_HEIGHT
                    if prev_scroll_y is not None:
                        dy = current_y - prev_scroll_y
                        if abs(dy) > 5.0:  # Ignore micro-movements
                            scroll_amount = -int(dy * 3)  # Map scroll speed
                            mouse.scroll(scroll_amount)
                            prev_scroll_y = current_y
                    else:
                        prev_scroll_y = current_y
                else:
                    prev_scroll_y = None
                    
                # 6. Move Cursor (Index only UP)
                if gesture == "MOVE":
                    index_tip = landmarks[8]
                    target_x, target_y = map_coordinates(index_tip.x, index_tip.y)
                    mouse.move_to(target_x, target_y)
            else:
                # If paused or buffering, release drag/scroll states safely
                mouse.stop_drag()
                prev_scroll_y = None
        else:
            mouse.stop_drag()
            prev_scroll_y = None
            gesture, state, landmarks = detector.get_confirmed_gesture(results)
            
        # Compute real-time processing FPS
        current_time = time.time()
        fps = 1.0 / (current_time - last_time) if (current_time - last_time) > 0 else 30.0
        last_time = current_time
        
        # Pushes processed frame + status variables to the main GUI thread
        if ui_queue.full():
            try:
                ui_queue.get_nowait()
            except queue.Empty:
                pass
        ui_queue.put((frame, gesture, state, hand_count, fps))
        
    # Thread termination safety
    mouse.stop_drag()
    print("[SYSTEM] Processing thread terminated.")


def map_coordinates(x, y):
    """
    Maps the normalized hand landmarks to absolute monitor pixels.
    """
    # Scale from interaction area box to screen range
    scaled_x = (x - config.X_MIN) / (config.X_MAX - config.X_MIN)
    scaled_y = (y - config.Y_MIN) / (config.Y_MAX - config.Y_MIN)
    
    # Clamp bounds to avoid coordinate overflows
    scaled_x = max(0.0, min(1.0, scaled_x))
    scaled_y = max(0.0, min(1.0, scaled_y))
    
    screen_x = int(scaled_x * config.SCREEN_WIDTH)
    screen_y = int(scaled_y * config.SCREEN_HEIGHT)
    
    return screen_x, screen_y


def main():
    # Start Camera Capturing Thread (Thread 1)
    cam_thread = threading.Thread(target=camera_capture_thread, args=(state_params, raw_frame_queue))
    cam_thread.daemon = True
    cam_thread.start()
    
    # Start Hand Processing Thread (Thread 2)
    proc_thread = threading.Thread(target=gesture_processing_thread, args=(state_params, raw_frame_queue, ui_queue))
    proc_thread.daemon = True
    proc_thread.start()
    
    # Main Thread: Run UI Overlay Window
    ui = UIOverlay(state_params)
    
    # Init CPU readings
    cpu_percent = psutil.cpu_percent()
    last_cpu_check = time.time()
    
    latest_frame = None
    gesture = "NONE"
    state = "NO_HAND"
    hand_count = 0
    fps = 30.0
    
    print("[SYSTEM] Friday Hand Gesture Control HUD is running. Keep cursor window focused to send hotkeys.")
    
    try:
        while state_params['running']:
            # Handle mouse click callbacks from UI window buttons
            if state_params['toggle_cam']:
                state_params['cam_on'] = not state_params['cam_on']
                state_params['toggle_cam'] = False
                
            if state_params['toggle_pause']:
                state_params['paused'] = not state_params['paused']
                state_params['toggle_pause'] = False
                
            if state_params['quit']:
                state_params['running'] = False
                break
                
            # Get latest frame processing data
            if state_params['cam_on']:
                try:
                    latest_frame, gesture, state, hand_count, fps = ui_queue.get(timeout=0.033)
                except queue.Empty:
                    pass
            else:
                latest_frame = None
                gesture = "NONE"
                state = "NO_HAND"
                hand_count = 0
                fps = 0.0
                
            # Update CPU usage reading once a second to minimize UI loop CPU load
            now = time.time()
            if now - last_cpu_check > 1.0:
                cpu_percent = psutil.cpu_percent()
                last_cpu_check = now
                
            # Draw overlay screen
            ui.draw_ui(latest_frame, gesture, state, fps, cpu_percent, state_params['cam_on'], state_params['paused'], hand_count)
            
            # Keyboard Hotkeys (Window Focus needed)
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q') or key == ord('Q'):
                state_params['running'] = False
                break
            elif key == ord('c') or key == ord('C'):
                state_params['cam_on'] = not state_params['cam_on']
            elif key == ord('p') or key == ord('P'):
                state_params['paused'] = not state_params['paused']
                
            # Small sleep to prevent Main Thread busy-looping
            time.sleep(0.01)
            
    except KeyboardInterrupt:
        print("[SYSTEM] Interrupt received. Terminating Friday OS Controller...")
    finally:
        state_params['running'] = False
        cam_thread.join(timeout=1.0)
        proc_thread.join(timeout=1.0)
        ui.close()
        print("[SYSTEM] Hand Gesture Control System successfully halted.")

if __name__ == "__main__":
    main()

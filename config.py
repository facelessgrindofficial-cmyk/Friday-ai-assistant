# config.py
import pyautogui

# Screen dimensions
SCREEN_WIDTH, SCREEN_HEIGHT = pyautogui.size()

# Camera settings
CAMERA_INDEX = 0
FRAME_WIDTH = 640
FRAME_HEIGHT = 480
FRAME_SKIP = 2  # Process every 2nd frame to reduce CPU load

# Smoothness & Deadzone
SMOOTH_ALPHA = 0.15  # Exponential moving average factor (lower = smoother/softer)
DEADZONE_PX = 5     # Ignore movements smaller than 5 pixels to eliminate jitter

# Interaction area in normalized coordinates [0.0, 1.0]
X_MIN = 0.05
X_MAX = 0.95
Y_MIN = 0.05
Y_MAX = 0.95

# Gesture Thresholds
PINCH_THRESHOLD_RATIO = 0.30  # Normalized ratio between index & thumb tip relative to hand size
CONFIRMATION_FRAMES = 3      # Number of consecutive frames to confirm a gesture

# Cooldowns (seconds)
LEFT_CLICK_COOLDOWN = 0.4
RIGHT_CLICK_COOLDOWN = 0.5
SCREENSHOT_COOLDOWN = 1.5

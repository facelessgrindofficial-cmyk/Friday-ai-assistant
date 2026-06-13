# mouse_controller.py
import pyautogui
import time
import math
import os
import config

# Setup PyAutoGUI behavior
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.0

class MouseController:
    def __init__(self):
        self.is_dragging = False
        self.prev_x, self.prev_y = pyautogui.position()
        
    def move_to(self, target_x, target_y):
        """
        Move cursor smoothly using exponential moving average and deadzone checking.
        """
        curr_x, curr_y = pyautogui.position()
        
        # Calculate distance to target
        dist = math.sqrt((target_x - curr_x)**2 + (target_y - curr_y)**2)
        
        # Deadzone filter to eliminate micro-jitter
        if dist < config.DEADZONE_PX:
            return
            
        # Exponential moving average (EMA)
        smooth_x = int(curr_x + (target_x - curr_x) * config.SMOOTH_ALPHA)
        smooth_y = int(curr_y + (target_y - curr_y) * config.SMOOTH_ALPHA)
        
        pyautogui.moveTo(smooth_x, smooth_y)
        
    def left_click(self):
        """
        Perform a left mouse click.
        """
        pyautogui.click()
        
    def right_click(self):
        """
        Perform a right mouse click.
        """
        pyautogui.rightClick()
        
    def start_drag(self):
        """
        Initiate drag state by holding down the left mouse button.
        """
        if not self.is_dragging:
            pyautogui.mouseDown()
            self.is_dragging = True
            
    def stop_drag(self):
        """
        Release drag state by releasing the left mouse button.
        """
        if self.is_dragging:
            pyautogui.mouseUp()
            self.is_dragging = False
            
    def scroll(self, amount):
        """
        Scroll vertically.
        """
        pyautogui.scroll(amount)
        
    def take_screenshot(self):
        """
        Capture a screenshot and save it locally.
        """
        try:
            if not os.path.exists("screenshots"):
                os.makedirs("screenshots")
            timestamp = time.strftime("%Y%m%d-%H%M%S")
            filepath = os.path.join("screenshots", f"screenshot_{timestamp}.png")
            screenshot = pyautogui.screenshot()
            screenshot.save(filepath)
            print(f"[SYSTEM] Screenshot captured and saved to: {filepath}")
        except Exception as e:
            print(f"[ERROR] Failed to save screenshot: {e}")

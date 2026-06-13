# launcher.py
import os
import sys
import time
import subprocess
import threading
import json
import ctypes
import webbrowser
import psutil
from colorama import init, Fore

# Initialize colorama
init(autoreset=True)

# Add launcher folder to python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import health
from tray import TrayIcon

# Global state variables
WORKSPACE_DIR = "f:\\Friday"
PIDS_FILE = os.path.join(WORKSPACE_DIR, "launcher", ".pids")
LOG_FILE = os.path.join(WORKSPACE_DIR, "launcher", "launcher.log")

processes = {
    "backend": None,
    "frontend": None,
    "gesture": None
}

retries = {
    "backend": 0,
    "frontend": 0,
    "gesture": 0
}

max_retries = 3
running = True
tray = None

def write_log(message):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {message}\n"
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_line)
    except Exception:
        pass
    print(message)

def kill_process_tree(pid):
    """
    Safely terminates a process and all of its spawned child processes.
    """
    try:
        parent = psutil.Process(pid)
        children = parent.children(recursive=True)
        for child in children:
            try:
                child.kill()
            except Exception:
                pass
        parent.kill()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass

def kill_port_owners(port):
    """
    Finds and kills any processes holding open connections on a given port.
    """
    for conn in psutil.net_connections(kind='inet'):
        try:
            if conn.laddr.port == port and conn.pid:
                write_log(f"Killing process holding port {port} (PID: {conn.pid})...")
                kill_process_tree(conn.pid)
        except Exception:
            pass

def clean_stale_processes():
    """
    Performs a clean-up on startup to ensure ports 5001 and 3000 are freed.
    """
    write_log("Starting clean-up of stale port owners...")
    kill_port_owners(5001)
    kill_port_owners(3000)
    
    # Read stale pids file if it exists
    if os.path.exists(PIDS_FILE):
        try:
            with open(PIDS_FILE, "r") as f:
                pids = json.load(f)
            for name, pid in pids.items():
                if pid:
                    write_log(f"Killing stale {name} process (PID: {pid})...")
                    kill_process_tree(pid)
        except Exception:
            pass
        try:
            os.remove(PIDS_FILE)
        except Exception:
            pass

def save_pids():
    pids_data = {
        "backend": processes["backend"].pid if processes["backend"] else None,
        "frontend": processes["frontend"].pid if processes["frontend"] else None,
        "gesture": processes["gesture"].pid if processes["gesture"] else None
    }
    try:
        with open(PIDS_FILE, "w") as f:
            json.dump(pids_data, f)
    except Exception as e:
        write_log(f"Error saving PIDs: {e}")

# Console UI rendering helpers
def clear_console():
    os.system('cls' if os.name == 'nt' else 'clear')

def get_badge(status, detail):
    if status == "⏳":
        return f"{Fore.YELLOW}[STARTING]"
    elif status == "❌":
        return f"{Fore.RED}[FAILED]  "
    elif status == "✅":
        if detail == "ACTIVE":
            return f"{Fore.GREEN}[ACTIVE]  "
        else:
            return f"{Fore.GREEN}[PORT {detail}]"
    else:
        return f"{Fore.WHITE}[WAITING] "

def draw_starting_console(backend_s, frontend_s, gesture_s, msg, show_logs=False):
    clear_console()
    print(f"{Fore.CYAN}  ╔═══════════════════════════════════╗")
    print(f"{Fore.CYAN}  ║      FRIDAY AI — Starting...      ║")
    print(f"{Fore.CYAN}  ╠═══════════════════════════════════╣")
    print(f"{Fore.CYAN}  ║  {backend_s} Backend...       {get_badge(backend_s, '5001')}   ║")
    print(f"{Fore.CYAN}  ║  {frontend_s} Frontend...      {get_badge(frontend_s, '3000')}   ║")
    print(f"{Fore.CYAN}  ║  {gesture_s} Gesture...       {get_badge(gesture_s, 'ACTIVE')}   ║")
    print(f"{Fore.CYAN}  ╠═══════════════════════════════════╣")
    print(f"{Fore.CYAN}  ║  {msg:<32} ║")
    print(f"{Fore.CYAN}  ╚═══════════════════════════════════╝")
    
    if show_logs:
        print(f"\n{Fore.YELLOW}--- LIVE BACKEND LOGS ---")
        with backend_log_lock:
            for line in backend_log_lines[-8:]:
                print(f" {Fore.WHITE}{line}")

def draw_ready_console():
    clear_console()
    print(f"{Fore.GREEN}  ╔═══════════════════════════════════╗")
    print(f"{Fore.GREEN}  ║       FRIDAY AI — Ready ✅        ║")
    print(f"{Fore.GREEN}  ╠═══════════════════════════════════╣")
    print(f"{Fore.GREEN}  ║  ✅ Backend...       [PORT 5001]  ║")
    print(f"{Fore.GREEN}  ║  ✅ Frontend...      [PORT 3000]  ║")
    print(f"{Fore.GREEN}  ║  ✅ Gesture...       [ACTIVE]     ║")
    print(f"{Fore.GREEN}  ╠═══════════════════════════════════╣")
    print(f"{Fore.GREEN}  ║  Opening http://localhost:3000    ║")
    print(f"{Fore.GREEN}  ╚═══════════════════════════════════╝")

# Process Spawning Methods
backend_log_lines = []
backend_log_lock = threading.Lock()

def start_backend():
    global backend_log_lines
    write_log("Starting Node.js Backend...")
    
    os.makedirs(os.path.join(WORKSPACE_DIR, "logs"), exist_ok=True)
    log_filepath = os.path.join(WORKSPACE_DIR, "logs", "backend.log")
    
    try:
        with open(log_filepath, "w", encoding="utf-8") as f:
            f.write("")
    except Exception:
        pass
        
    processes["backend"] = subprocess.Popen(
        ["node", "server.js"],
        cwd=os.path.join(WORKSPACE_DIR, "backend"),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        shell=True
    )
    save_pids()
    
    def log_reader():
        global backend_log_lines
        try:
            # Safe iterator to read line-by-line in background
            for line in processes["backend"].stdout:
                if not line:
                    break
                try:
                    with open(log_filepath, "a", encoding="utf-8") as f:
                        f.write(line)
                except Exception:
                    pass
                with backend_log_lock:
                    backend_log_lines.append(line.strip())
                    if len(backend_log_lines) > 15:
                        backend_log_lines.pop(0)
        except Exception:
            pass
            
    t = threading.Thread(target=log_reader)
    t.daemon = True
    t.start()

def start_frontend():
    write_log("Starting Next.js Frontend...")
    processes["frontend"] = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=os.path.join(WORKSPACE_DIR, "frontend"),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        shell=True
    )
    save_pids()

def start_gesture():
    write_log("Starting Standalone Gesture Script...")
    processes["gesture"] = subprocess.Popen(
        ["python", "gesture_control.py"],
        cwd=WORKSPACE_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    save_pids()

def start_sequence():
    """
    Orchestrates sequential startup and renders progress in terminal console.
    """
    clean_stale_processes()
    
    # 1. Start Backend
    draw_starting_console("⏳", "⚪", "⚪", "Starting Backend...")
    start_backend()
    
    # Wait for backend health with a 60-second timeout
    start_time = time.time()
    backend_timeout = 60.0
    backend_healthy = False
    
    while time.time() - start_time < backend_timeout:
        elapsed = int(time.time() - start_time)
        draw_starting_console(
            "⏳", "⚪", "⚪", 
            f"Waiting for Backend (5001)... [{elapsed}s / 60s timeout]",
            show_logs=True
        )
        if health.check_backend():
            backend_healthy = True
            break
        time.sleep(1.0)
        
    if not backend_healthy:
        clear_console()
        print(f"{Fore.RED}=======================================================")
        print(f"{Fore.RED}❌ Backend failed to start. Check logs at f:\\Friday\\logs\\backend.log")
        print(f"{Fore.RED}=======================================================")
        print("\nLast backend log output:")
        with backend_log_lock:
            if backend_log_lines:
                for line in backend_log_lines:
                    print(f"  {line}")
            else:
                print("  No logs captured from backend process.")
        print("\nPress Enter to exit...")
        input()
        shutdown_all()
        sys.exit(1)
        
    # 2. Start Frontend
    draw_starting_console("✅", "⏳", "⚪", "Starting Frontend...")
    start_frontend()
    
    # Wait for frontend health
    while not health.check_frontend():
        time.sleep(1.0)
        draw_starting_console("✅", "⏳", "⚪", "Waiting for Frontend (3000)...")
        
    # 3. Start Gesture
    draw_starting_console("✅", "✅", "⏳", "Starting Gesture Control...")
    start_gesture()
    
    # Wait for gesture confirmation
    while not health.check_gesture(processes["gesture"].pid):
        time.sleep(1.0)
        draw_starting_console("✅", "✅", "⏳", "Verifying Gesture System...")
        
    draw_ready_console()
    time.sleep(2.0)
    
    # Hide own console window
    try:
        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 0)
    except Exception:
        pass

def monitor_loop():
    """
    Background loop checking systems health every 5 seconds.
    Auto-restarts failed services up to max_retries.
    """
    global running, tray
    write_log("Health Monitor thread started.")
    
    while running:
        time.sleep(5.0)
        if not running:
            break
            
        b_ok = health.check_backend()
        f_ok = health.check_frontend()
        g_ok = health.check_gesture(processes["gesture"].pid if processes["gesture"] else None)
        
        # Determine status signals
        if b_ok and f_ok and g_ok:
            tray.update_status("running", "All systems running")
            # Reset recovery counters when healthy
            retries["backend"] = 0
            retries["frontend"] = 0
            retries["gesture"] = 0
            continue
            
        # Recovery procedures
        # 1. Backend Recovery
        if not b_ok:
            if retries["backend"] < max_retries:
                retries["backend"] += 1
                tray.update_status("recovering", f"Recovering Backend (Attempt {retries['backend']}/{max_retries})")
                tray.send_notification("FRIDAY Alert", f"Backend crashed. Restarting (Attempt {retries['backend']})...")
                write_log(f"[RECOVERY] Backend down. Restarting (Attempt {retries['backend']})...")
                if processes["backend"]:
                    kill_process_tree(processes["backend"].pid)
                start_backend()
            else:
                tray.update_status("error", "Backend failed (Critical)")
                tray.send_notification("FRIDAY Critical Error", "Backend failed to restart after 3 attempts.")
                write_log("[CRITICAL] Backend recovery threshold reached. Failure.")
                
        # 2. Frontend Recovery
        if not f_ok:
            if retries["frontend"] < max_retries:
                retries["frontend"] += 1
                tray.update_status("recovering", f"Recovering Frontend (Attempt {retries['frontend']}/{max_retries})")
                tray.send_notification("FRIDAY Alert", f"Frontend crashed. Restarting (Attempt {retries['frontend']})...")
                write_log(f"[RECOVERY] Frontend down. Restarting (Attempt {retries['frontend']})...")
                if processes["frontend"]:
                    kill_process_tree(processes["frontend"].pid)
                start_frontend()
            else:
                tray.update_status("error", "Frontend failed (Critical)")
                tray.send_notification("FRIDAY Critical Error", "Frontend failed to restart after 3 attempts.")
                write_log("[CRITICAL] Frontend recovery threshold reached. Failure.")
                
        # 3. Gesture Recovery (Only if intended to be active)
        if not g_ok and tray.gesture_active:
            if retries["gesture"] < max_retries:
                retries["gesture"] += 1
                tray.update_status("recovering", f"Recovering Gesture (Attempt {retries['gesture']}/{max_retries})")
                tray.send_notification("FRIDAY Alert", f"Gesture system crashed. Restarting (Attempt {retries['gesture']})...")
                write_log(f"[RECOVERY] Gesture system down. Restarting (Attempt {retries['gesture']})...")
                if processes["gesture"]:
                    kill_process_tree(processes["gesture"].pid)
                start_gesture()
            else:
                tray.update_status("error", "Gesture failed (Critical)")
                tray.send_notification("FRIDAY Critical Error", "Gesture system failed to restart after 3 attempts.")
                write_log("[CRITICAL] Gesture system recovery threshold reached. Failure.")

def handle_tray_action(action, value):
    """
    Receives callbacks from context menu clicks.
    """
    global running, tray
    
    if action == "quit":
        write_log("Shutdown requested from system tray.")
        running = False
        shutdown_all()
        sys.exit(0)
        
    elif action == "toggle_gesture":
        active = value
        write_log(f"Gesture system toggled: {active}")
        if active:
            if not health.check_gesture(processes["gesture"].pid if processes["gesture"] else None):
                start_gesture()
        else:
            if processes["gesture"]:
                write_log("Stopping gesture control process...")
                kill_process_tree(processes["gesture"].pid)
                processes["gesture"] = None
                
    elif action == "restart_backend":
        write_log("Manual restart of Backend requested.")
        if processes["backend"]:
            kill_process_tree(processes["backend"].pid)
        retries["backend"] = 0
        start_backend()
        
    elif action == "restart_frontend":
        write_log("Manual restart of Frontend requested.")
        if processes["frontend"]:
            kill_process_tree(processes["frontend"].pid)
        retries["frontend"] = 0
        start_frontend()
        
    elif action == "restart_gesture":
        write_log("Manual restart of Gesture requested.")
        if processes["gesture"]:
            kill_process_tree(processes["gesture"].pid)
        retries["gesture"] = 0
        if tray.gesture_active:
            start_gesture()

def shutdown_all():
    """
    Terminates all running processes, removes PID logs, and closes locks.
    """
    write_log("Starting clean shutdown sequence...")
    
    # 1. Kill Gesture
    if processes["gesture"]:
        write_log("Stopping Gesture process...")
        kill_process_tree(processes["gesture"].pid)
        
    # 2. Kill Frontend
    if processes["frontend"]:
        write_log("Stopping Frontend process tree...")
        kill_process_tree(processes["frontend"].pid)
        
    # 3. Kill Backend
    if processes["backend"]:
        write_log("Stopping Backend process tree...")
        kill_process_tree(processes["backend"].pid)
        
    # 4. Clean up any stragglers remaining on ports
    kill_port_owners(5001)
    kill_port_owners(3000)
    
    # 5. Remove PID tracking files
    if os.path.exists(PIDS_FILE):
        try:
            os.remove(PIDS_FILE)
        except Exception:
            pass
            
    write_log("Shutdown complete.")

def main():
    global tray
    
    # Start sequence in foreground
    try:
        start_sequence()
    except KeyboardInterrupt:
        write_log("Startup interrupted by Ctrl+C.")
        shutdown_all()
        sys.exit(0)
        
    # Setup Tray Icon
    tray = TrayIcon(handle_tray_action)
    tray.update_status("running", "All systems running")
    
    # Run Health Monitor in background
    monitor_thread = threading.Thread(target=monitor_loop)
    monitor_thread.daemon = True
    monitor_thread.start()
    
    # Block and run tray icon on main thread
    try:
        tray.run()
    except KeyboardInterrupt:
        write_log("Application interrupted.")
    finally:
        shutdown_all()

if __name__ == "__main__":
    main()

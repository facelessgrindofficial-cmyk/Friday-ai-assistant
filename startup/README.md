# 🚀 Project Startup Guide

This folder contains automated scripts and instructions to start your development servers quickly without having to remember the exact commands.

---

## 🛠️ Automated Startup (Double-Click)

You can launch your projects using the automated batch scripts in this folder:

1. **`launcher.bat`**: A master script that lets you choose which project to launch from an interactive menu.
2. **`start_friday.bat`**: Starts the **Friday AI Assistant** (both Backend & Frontend).
3. **`start_pomodoro.bat`**: Starts the **NEET Pomodoro Study Hub** (Backend server & opens Frontend in browser).

---

## 💻 Manual Commands

If you prefer to run commands manually in your terminal, here is the reference:

### 1. Friday AI Assistant (Main Project)

To run the main assistant, you need to start two terminals:

#### **Backend Server**
* **Directory**: `f:\Friday\backend`
* **Command**:
  ```powershell
  cd f:\Friday\backend
  npm run dev
  ```
* **Runs on**: `http://localhost:5000` (or your configured port)

#### **Frontend Client**
* **Directory**: `f:\Friday\frontend`
* **Command**:
  ```powershell
  cd f:\Friday\frontend
  npm run dev
  ```
* **Runs on**: `http://localhost:3000`

---

### 2. NEET Pomodoro Study Hub

To run the Pomodoro hub:

#### **Backend Server**
* **Directory**: `f:\Friday\neet\pomodoro\backend`
* **Command**:
  ```powershell
  cd f:\Friday\neet\pomodoro\backend
  npm run dev
  ```
* **Runs on**: `http://localhost:5002`

#### **Frontend Client**
* **Directory**: `f:\Friday\neet\pomodoro\frontend`
* **Action**: Open the `index.html` file in your browser.
* **Path**: `f:\Friday\neet\pomodoro\frontend\index.html`

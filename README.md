# ConvoScape 🎙️✨

> **Master your hackathon pitch, tackle tough judge questions, and defend your project with confidence.**

**ConvoScape** is an intelligent, real-time presentation practice simulator designed to help students, developers, and builders practice their hackathon presentation before stepping in front of real judges. 

You sit at a table inside a virtual hackathon hall, warm up with a peer who visits your booth, deliver your pitch to a panel of formal judges, and receive a complete analytical report based on your actual spoken words, verbal delivery, and technical defense.

---

## 🎯 Who Is ConvoScape For?

* 🏆 **Hackathon Participants**: Practice your pitch under real-time conditions so you never freeze, ramble, or lose track of time during jury evaluation.
* 🎓 **Students & First-Time Pitchers**: Learn how to transition from simply reciting code to clearly explaining system architecture, problem-solution fit, and real-world value.
* 💻 **Engineers & Developers**: Sharpen your ability to defend technical choices (databases, APIs, state management) when judges ask spontaneous drill-down questions.
* 🚀 **Founders & Project Teams**: Test how effectively you explain your project's target user adoption, limitations, and future roadmap.

---

## 💡 Why Practice with ConvoScape?

Most hackathon teams build great projects but lose points during evaluation because of:
1. **Rushing or Exceeding Time Limits**: Struggling to deliver a structured 3-minute pitch.
2. **Freezing on Spontaneous Questions**: Getting caught off guard when judges drill into architecture trade-offs, edge cases, or scalability.
3. **Delivery & Filler Words**: Excessive `um`s, `uh`s, repetitions, or losing eye contact due to nervousness.

**ConvoScape provides a safe, realistic sandbox to build confidence and polish your answers before it counts.**

---

## 🔄 End-to-End Workflow

```
[ 1. QUICK PROJECT ONBOARDING ]
• Enter your Team Name and project details (track, elevator pitch, problem, tech stack).
• Grant local microphone and optional camera consent.
                          │
                          ▼
[ 2. PEER WARM-UP ROUND WITH RAHUL ]
• A fellow hacker (Rahul) walks over to your table to ask about what you built.
• Have a natural, multi-turn conversation discussing your motivation, technical hurdles, and features.
• Shakes off early nervousness and captures baseline speaking pace and vocal clarity.
                          │
                          ▼
[ 3. FORMAL JUDGES EVALUATION PANEL ]
• Two judges arrive at your table:
  - Lead Judge: Evaluates problem-solution fit, presentation structure, user adoption, and roadmap.
  - Technical Judge: Drills down into your architecture, tech stack decisions, and trade-offs.
• Deliver your 3-minute pitch with a built-in timer.
• Answer spontaneous technical and product defense questions on the spot.
                          │
                          ▼
[ 4. COMPREHENSIVE DUAL-TAB PERFORMANCE DASHBOARD ]
• 🎓 Student Communication Report:
  - Speaking pace (WPM), pause timing, filler word breakdown (`um`, `uh`, `like`), repetition, and eye contact.
  - Actionable feedback on verbal clarity and structure.
• 🧑‍⚖️ Judges Feedback Report:
  - 100-point hackathon rating across 5 key dimensions: Technical Depth, Problem Fit, Feasibility, Spontaneous Defense, and Clarity.
  - Question-by-question analysis of your answers against expected defense points.
  - Scalability, edge-case review, and prioritized recommendations before demo day.
• Export your full evaluation as a formatted PDF or JSON.
```

---

## ✨ Core Features & Highlights

* 🎬 **Lifelike Video Avatars**: Interacts through high-definition video characters with real-time neural lip-sync and dynamic head-tracking.
* 🎙️ **Faithful Speech Analysis**: Captures the words you actually speak—including filler words, false starts, and natural silences—using Web Audio API acoustic tracking.
* 👁️ **Camera Presence Coaching**: Optional browser-side vision analysis tracks eye contact consistency, head posture, and stability without any video ever leaving your device.
* ⚖️ **Objective, Evidence-Based Scoring**: Evaluates your performance by quoting your actual spoken statements, ensuring concrete and actionable feedback.
* 📄 **Downloadable Action Plan**: Export a complete performance PDF report to share with teammates and mentors.

---

## 🛠️ Tech Stack & Technologies Used

ConvoScape combines cutting-edge AI, computer vision, neural video synthesis, and modern web technologies:

| Technology | Role & Purpose in ConvoScape |
|---|---|
| **Wav2Lip Neural Model** | Generates real-time neural lip-sync synchronization so characters naturally speak dialogue. |
| **ONNX Runtime & DirectML** | Hardware-accelerates neural network inference on GPUs for low-latency video generation. |
| **Google Gemini 2.5 Flash** | Powers dynamic conversational dialogue, tailored technical drill-down questions, and structured evaluation reports. |
| **Web Audio API** | Analyzes physical acoustic energy to measure real pauses, silences, and speech durations independently of STT token delays. |
| **Google MediaPipe Face Mesh** | Runs 100% client-side to track 468 3D facial landmarks for apparent eye contact, gaze aversion, and head pose orientation. |
| **OpenCV & FFmpeg** | Handles real-time per-frame mouth tracking on high-res footage and zero-latency video encoding. |
| **Edge-TTS / Web Speech API** | Synthesizes character voices with distinct regional accents and natural prosody (Rahul, Lead Judge, Technical Judge). |
| **Next.js 15 & React 19** | Full-stack modern web framework providing server-side API endpoints, multi-stage state machines, and streaming. |
| **TypeScript & Zod** | Enforces strict end-to-end type safety and schema validation on all AI-generated JSON structures. |
| **Tailwind CSS** | Crafts the minimalist, immersive dark-mode hackathon hall environment and report dashboard. |
| **jsPDF & Vitest** | Automated downloadable PDF report generation and 69 automated unit/integration test suites. |

---

## ⚡ Quick Start

### 1. Prerequisites
* **Node.js**: v18.17+ or v20+
* **Python**: 3.10 – 3.13 (for local video generation)
* **Google Gemini API Key**: [Get a Gemini Key](https://aistudio.google.com/)

### 2. Setup & Installation
```bash
# Clone the repository
git clone https://github.com/Shreya10052006/ConvoScape.git
cd ConvoScape

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Open .env.local and insert your GEMINI_API_KEY
```

### 3. Start the Simulator
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser and start your practice session!

### 4. Run Automated Tests
```bash
npm test
```

---

## 🧪 Quality & Test Verification

ConvoScape is backed by automated tests validating the full experience:
* **Session State Engine**: Smooth transitions from setup to peer warm-up, judges evaluation, and report.
* **Speech & Silence Analysis**: Accurate detection of filler words, speaking rate, and physical pauses.
* **AI Evaluation Robustness**: Deterministic fallback reports and PDF generation guarantee the app functions reliably offline.

---

## 📄 License
MIT License. Built for builders, hackers, and students everywhere. **Practice before it counts!** 🚀

# Shortlistr: AI-Powered Talent Acquisition & Interview Orchestrator

Shortlistr is an end-to-end recruitment automation platform that transforms raw resumes into scheduled interviews using Agentic AI. The system automates resume screening, candidate scoring, and calendar scheduling by bridging a modern UI with complex backend workflows.

## 🚀 Key Features
- **AI Resume Screening:** Extracts data from PDFs and scores candidates against specific JD mandates (e.g., Java 17, Spring Boot, FinTech experience).
- **Automated Database Management:** Uses Google Sheets as a live database for real-time candidate tracking.
- **Smart Interview Scheduling:** A one-click "Confirm Appointment" feature that syncs with Google Calendar and sends automated Gmail invites.
- **Self-Healing Logic:** Implemented "Wait" states and error handling to manage Google API quotas and data synchronization.

## 🏗️ Technical Architecture
The system is built on a decoupled architecture for maximum scalability:
- **Frontend:** [Lovable.dev](https://lovable.dev) (React/TypeScript)
- **Orchestration:** [n8n.io](https://n8n.io) (Workflow Automation)
- **AI Brain:** OpenAI GPT-4o (Agentic text analysis)
- **Data Layer:** Google Sheets API
- **Communication:** Google Calendar API & Gmail API

## 🛠️ "Hit & Trial" Debugging & Problem Solving
During development, several architectural challenges were resolved:
1. **API Quota Management:** Resolved `422: Quota Exceeded` errors on Google Sheets by implementing a 2-second throttling delay (Wait Node) within the screening loop.
2. **Data Integrity:** Fixed `Undefined Split` crashes in the Invite workflow by enforcing a strict JSON schema handshake between the React frontend and n8n Webhooks.
3. **Database Fragmentation:** Solved duplicate column creation in Google Sheets by configuring "Match On" parameters using Email as a Primary Key.

## 📂 Repository Structure
- `/n8n-workflows`: JSON exports of the Screening and Invite workflows.
- `/src`: Frontend React components and API fetch logic.
- `System_Architecture.png`: Visual map of the service integrations.

## 🚦 Getting Started
1. Import the `.json` files from `/n8n-workflows` into your n8n instance.
2. Set up environment variables for OpenAI API, Google Service Accounts, and Webhook URLs.
3. Connect the Lovable frontend to your n8n Production Webhook URL.

# TROY'S FOOTY IQ

A complete full-stack football analytics engine for personal use with live match syncing and automated low-risk pick generation using the Anthropic Claude API.

## Setup Instructions

1. **Environment Variables:**
   - Copy `.env.example` to `.env` in the root folder.
   - Fill in your `FOOTBALLDATA_TOKEN` (from [football-data.org](https://www.football-data.org/client/register))
   - Fill in your `RAPIDAPI_KEY` (from rapidapi.com / API-Football)
   - Fill in your `ANTHROPIC_API_KEY` (for AI picks)

2. **Start Database:**
   ```bash
   docker-compose up -d
   ```

3. **Backend:**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

4. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Enjoy your AI-powered picks and live tracking!

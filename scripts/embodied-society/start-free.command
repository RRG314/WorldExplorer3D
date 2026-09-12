#!/bin/bash
set -e
cd "$(dirname "$0")/../.."
printf '%s\n' 'World Explorer — free hosted AI pilot' 'Create an API key at https://aistudio.google.com/api-keys' 'Use a Gemini Google AI Studio project on the Free tier. Do not enable paid billing.' 'This app cannot check your provider billing plan.' 'Choose a faster six-hour simulation, eight-hour real-time observation, or the short pilot. Quota failures stop the run.'
read -r -p 'Type FREE to confirm your project is on the Free tier: ' research_plan
if [ "$research_plan" != FREE ]; then exit 1; fi
read -r -p 'Study window: fast, 8h or pilot [fast]: ' research_window
case "$research_window" in
  ""|fast) export WE3D_RESEARCH_RUN_WINDOW=fast-needs-6h ;;
  8h) export WE3D_RESEARCH_RUN_WINDOW=needs-8h ;;
  pilot) export WE3D_RESEARCH_RUN_WINDOW=pilot-15m ;;
  *) printf '%s\n' 'Choose fast, 8h or pilot.'; exit 1 ;;
esac
read -r -s -p 'Paste the Gemini API key (hidden), then press Return: ' WE3D_RESEARCH_API_KEY
printf '\n'
if [ -z "$WE3D_RESEARCH_API_KEY" ]; then printf '%s\n' 'No key entered.'; exit 1; fi
export WE3D_RESEARCH_API_KEY
export WE3D_FREE_PLAN_CONFIRMED=1
printf '%s\n' 'Open http://127.0.0.1:4498/app/ then choose a world and Start AI resident.' 'Keep this window open. Control-C stops the server. The key is not saved to a file.'
exec node scripts/embodied-society/live-server.mjs --free

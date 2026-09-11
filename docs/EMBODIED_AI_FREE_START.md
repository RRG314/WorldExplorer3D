# Start the free hosted AI pilot

This uses a real model hosted by Google Gemini. Your Mac runs the world; Google Gemini runs the model. It is an early research pilot: the real world now loads, and two live model-selected gather actions have been verified. A free account supports bounded testing, not unlimited continuous societies. The selected pilot model is `gemini-3.1-flash-lite`.

1. Open [Google Gemini Console](https://aistudio.google.com/api-keys), create/sign into your account, and create an API key. Keep the AI Studio project on the **Free tier**. Do not enable paid billing for this test.
2. In Finder, open this project's `scripts/embodied-society/start-free.command`. It opens a Terminal window. Type `FREE` when asked, then paste your key and press Return. The key will be invisible while entering it; that is intentional. It is kept in the server process environment, not saved to a file, browser or Git.
3. Leave that window open. Open [World Explorer research](http://127.0.0.1:4498/app/), select Baltimore and press Explore. The measured load was about 83 seconds; allow longer if needed.
4. After the world loads, select **Start AI resident**. The resident receives its observations and chooses actions using the model. Research supplies and supported recipes are deliberately supplied starting conditions; there is no prescribed action sequence. The first pilot permits at most 20 decisions, spaced at least one minute apart to reduce free-quota pressure. It may stop sooner at the simulation-time or other limits.
5. Use **Pause** or **End run** in the research panel. Press **Control-C** in the Terminal window to stop the server afterward. Relaunching creates a new run ID; existing runs are retained as evidence, not silently resumed.

If macOS opens the launcher as text, run it from Terminal with:

```sh
bash ./scripts/embodied-society/start-free.command
```

Never paste the key into a chat or source file. If another service already uses port 4498, the launcher reports that conflict; do not stop unrelated services blindly.

The app cannot verify your Google Gemini billing plan. Its zero-dollar setting does not make a paid provider account free. Confirm **Free** in Google Gemini's account settings. Account-specific free limits may differ; hitting quota stops the pilot without retrying or selecting a paid service. World observations are sent to Google Gemini to obtain decisions.

Earlier attempts exposed Google model overload and a mixed-action response problem. Both are documented in the research evidence. The corrected Flash-Lite run completed two real model-selected gather actions; sustained survival remains unverified. If the first actual launch reports an error, retain the visible message so we can fix the real failure. Shelter/rest, long-term memory, populations and autonomous engineering remain incomplete parts of the larger plan.

Official references checked September 11, 2026: [API key setup](https://ai.google.dev/gemini-api/docs/api-key), [Free-plan limits](https://ai.google.dev/gemini-api/docs/rate-limits), [strict structured action support](https://ai.google.dev/gemini-api/docs/structured-output).

A local setup form is also available at `http://127.0.0.1:4498/research-setup` when the unconfigured research server is running (`npm run experiment:society`). It accepts the Gemini key into server memory and clears the password field after submission. It requires the loopback session and Free-tier confirmation, and refuses replacement of a configured provider. No key is written to a file.

Latest result, September 11: Gemini 3.1 Flash-Lite selected gathering one water and one snack in the actual Baltimore world. Both were accepted into the real inventory. Pause, frozen paused time, Resume and End were checked. The 3.8 Flash model had returned a documented high-demand 503; the default is now Flash-Lite. This is a successful first action test, not proof of sustained survival, crafting or construction. Use Test Gemini connection on the setup page before loading the world; it consumes one call from the same allowance and never applies an action. At most three idle connection checks are permitted; no automatic paid fallback exists.

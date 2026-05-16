import xapi from 'xapi';
/* =========================================================
   AUTO CAMERA SWITCHING (PresenterTrack monitored in Background)
   =========================================================
   Goal:
   - Keep Audience camera as main video unless a presenter is detected.
   - Monitor PresenterTrack in the background (without switching main video).
   - When presenter is detected -> switch main video to Presenter camera.
   - When presenter is lost -> switch main video to Audience camera.
   - Only active while in a call (configurable).
   FUNCTION OVERVIEW:
   - log(msg): Always-on logs for key state changes/errors.
   - dbg(msg): Debug logs (toggle with DEBUG).
   - isEnabled(): Returns true when macro should act (in-call gating).
   - setMainSource(id, label): Switches main video source with rate limiting.
   - setPresenterTrackFollow(): Starts PresenterTrack algorithm (can run in Background).
   - handlePresenterDetected(value): Core switching logic based on PresenterDetected.
   - handlePresenterTrackStatus(value): Optional health check; re-enables Follow if tracking stops.
   - startMonitoring(): Enables monitoring when a call starts.
   - stopMonitoring(): Disables monitoring when the call ends.
   - handleCallCountChange(count): Starts/stops monitoring based on call count.
   - init(): Subscribes to statuses and performs startup sync.
   ========================================================= */
/* =========================
   CONFIG — START
   ========================= */
const DEBUG = true;
// Camera connector IDs (MUST match your codec inputs)
const PRESENTER_CAMERA_CONNECTOR_ID = 8;
const AUDIENCE_CAMERA_CONNECTOR_ID = 7;
// Delay before switching back to Audience after presenter is lost (ms)
const LOSS_DELAY_MS = 1500;
// Rate limit switching to prevent flapping (ms)
const MIN_SWITCH_INTERVAL_MS = 1500;
// Only act while in call
const ONLY_MONITOR_IN_CALL = true;
// Controls if PresenterTrack Status becomes Off during monitoring, try to re-enable or don't.
// Set false if you do NOT want any “re-assertion”.
const AUTO_RECOVER_PRESENTERTRACK = true;
/* =========================
   CONFIG — END
   ========================= */
let inCall = false;
let active = false;
let lastSwitchTime = 0;
let lastDesiredSource = null; // 'presenter' | 'audience' | null
let lossTimer = null;
function log(msg) {
  console.log(`AutoCam: ${msg}`);
}
function dbg(msg) {
  if (!DEBUG) return;
  console.log(`AutoCam: ${msg}`);
}
function isEnabled() {
  if (!active) return false;
  if (!ONLY_MONITOR_IN_CALL) return true;
  return inCall;
}
function clearLossTimer() {
  if (lossTimer) {
    clearTimeout(lossTimer);
    lossTimer = null;
  }
}
async function setMainSource(connectorId, label) {
  const t = Date.now();
  if (label && lastDesiredSource === label) {
    dbg(`Main source already desired: ${label}`);
    return;
  }
  if (t - lastSwitchTime < MIN_SWITCH_INTERVAL_MS) {
    dbg(`Switch rate-limited. Wanted ConnectorId=${connectorId}`);
    return;
  }
  lastSwitchTime = t;
  try {
    await xapi.Command.Video.Input.SetMainVideoSource({ ConnectorId: connectorId });
    lastDesiredSource = label || null;
    log(`Main video -> ${label} (ConnectorId=${connectorId})`);
  } catch (e) {
    log(`ERROR switching main source: ${e.message || e}`);
  }
}
async function setPresenterTrackFollow() {
  try {
    // Enables PresenterTrack algorithm. When presenter cam is NOT main,
    // it can run in "Background" on supported setups.
    await xapi.Command.Cameras.PresenterTrack.Set({ Mode: 'Follow' });
    dbg('PresenterTrack Set: Follow');
  } catch (e) {
    log(`WARN: PresenterTrack Set Follow failed: ${e.message || e}`);
  }
}
async function handlePresenterDetected(value) {
  if (!isEnabled()) return;
  const detected = (value === true || value === 'True');
  const notDetected = (value === false || value === 'False');
  dbg(`PresenterDetected=${value}`);
  if (detected) {
    clearLossTimer();
    // Presenter detected -> switch to presenter camera
    await setMainSource(PRESENTER_CAMERA_CONNECTOR_ID, 'presenter');
    return;
  }
  if (notDetected) {
    clearLossTimer();
    // Presenter lost -> wait a bit (avoid flapping), then switch to audience
    lossTimer = setTimeout(async () => {
      await setMainSource(AUDIENCE_CAMERA_CONNECTOR_ID, 'audience');
    }, LOSS_DELAY_MS);
    return;
  }
}
async function handlePresenterTrackStatus(value) {
  if (!isEnabled()) return;
  if (!AUTO_RECOVER_PRESENTERTRACK) return;
  const status = String(value || '');
  dbg(`PresenterTrack Status=${status}`);
  // If tracking stops, try to re-enable Follow so background detection can continue
  if (status === 'Off') {
    log('PresenterTrack Status=Off -> attempting recovery (Follow)');
    await setPresenterTrackFollow();
  }
}
async function startMonitoring() {
  if (active) return;
  active = true;
  log('Monitoring STARTED');
  // Keep audience as main by default
  await setMainSource(AUDIENCE_CAMERA_CONNECTOR_ID, 'audience');
  // Start PresenterTrack algorithm so it can detect in the background
  await setPresenterTrackFollow();
  // Initial sync
  try {
    const detected = await xapi.Status.Cameras.PresenterTrack.PresenterDetected.get();
    await handlePresenterDetected(detected);
  } catch (e) {
    dbg(`Initial PresenterDetected read failed: ${e.message || e}`);
  }
}
function stopMonitoring() {
  if (!active) return;
  active = false;
  clearLossTimer();
  log('Monitoring STOPPED');
}
async function handleCallCountChange(countValue) {
  const activeCalls = Number(countValue) || 0;
  const newInCall = activeCalls > 0;
  if (newInCall === inCall) return;
  inCall = newInCall;
  log(`Call state changed. inCall=${inCall} (activeCalls=${activeCalls})`);
  if (ONLY_MONITOR_IN_CALL) {
    if (inCall) await startMonitoring();
    else stopMonitoring();
  }
}
async function init() {
  log('Init');
  // Presenter detection signal
  try {
    xapi.Status.Cameras.PresenterTrack.PresenterDetected.on(handlePresenterDetected);
  } catch (e) {
    log(`ERROR subscribing to PresenterDetected: ${e.message || e}`);
  }
  // PresenterTrack status (Off / Follow / Background / etc.)
  try {
    xapi.Status.Cameras.PresenterTrack.Status.on(handlePresenterTrackStatus);
  } catch (e) {
    log(`ERROR subscribing to PresenterTrack Status: ${e.message || e}`);
  }
  // Call gating
  try {
    xapi.Status.SystemUnit.State.NumberOfActiveCalls.on(handleCallCountChange);
  } catch (e) {
    log(`ERROR subscribing to NumberOfActiveCalls: ${e.message || e}`);
  }
  // Startup sync
  try {
    const callCount = await xapi.Status.SystemUnit.State.NumberOfActiveCalls.get();
    await handleCallCountChange(callCount);
  } catch (e) {
    log(`ERROR reading NumberOfActiveCalls at startup: ${e.message || e}`);
  }
  // If not call-gated, start immediately
  if (!ONLY_MONITOR_IN_CALL) {
    await startMonitoring();
  }
}
init();

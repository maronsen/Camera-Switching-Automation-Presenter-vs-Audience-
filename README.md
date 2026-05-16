# Camera Switching Automation (Presenter vs Audience)
## Extended Description

This macro was created to make camera behavior in presenter-focused Cisco Room systems more automatic, stable, and user friendly. It is intended for rooms with separate audience and presenter cameras, where the audience view should normally be shown, but the presenter view should automatically become active when someone is presenting.

The goal is to reduce manual camera control and make the room behave more intelligently during hybrid meetings. Instead of requiring users to select the correct camera input manually, the macro uses PresenterTrack detection and call state to decide when camera switching should happen.

***

## Why This Macro Exists

In many hybrid rooms, the best camera view depends on what is happening in the room. During normal discussion, remote participants usually benefit from seeing the audience or room overview. When someone starts presenting, teaching, or speaking from a defined presenter area, the presenter camera becomes the more relevant view.

Without automation, users often need to manually select cameras or know how PresenterTrack works. This macro removes that responsibility from the user and lets the system choose the most relevant camera view automatically.

It is especially useful where:

*   Audience view should be the default
*   Presenter view should only be used when a presenter is detected
*   Users should not manually change camera inputs
*   PresenterTrack should run in the background as a detection source
*   Automatic switching should only run during active calls
*   Camera switching should be smooth and not overly sensitive

***

## How The Macro Works

The macro listens to Cisco xAPI status changes for call state, PresenterTrack detection, and PresenterTrack status.

When monitoring starts, the macro first selects the audience camera as the main video source. It then enables PresenterTrack in `Follow` mode so the codec can detect whether a presenter is present.

PresenterTrack is used as the trigger, not as a permanent main camera mode. The audience camera stays active until `PresenterDetected` reports that a presenter is present.

When a presenter is detected, the macro switches the main video source to the configured presenter camera. When the presenter is no longer detected, the macro waits for a configured delay before returning to the audience camera.

This gives the room a predictable workflow:

*   Start with audience view
*   Detect presenter in the background
*   Switch to presenter view when needed
*   Return to audience view when presenter activity stops

***

## Configuration Options

The macro includes a small configuration section that controls logging, camera connector IDs, timing behavior, call-based monitoring, and PresenterTrack recovery.

### Debug Logging

```javascript
const DEBUG = true;
```

Controls whether debug messages are shown in the macro log.

*   `true` enables detailed debug logging
*   `false` keeps the log cleaner and only shows important operational messages

This is useful during testing, commissioning, and troubleshooting. In production, this can normally be set to `false` unless detailed logs are needed.

***

### Presenter Camera Connector

```javascript
const PRESENTER_CAMERA_CONNECTOR_ID = 8;
```

Defines which video input connector is used for the presenter camera.

This is the camera the macro switches to when PresenterTrack detects a presenter. The value must match the actual connector ID used on the Cisco codec.

Example:

*   Presenter camera connected to input 8
*   Macro switches to ConnectorId `8` when a presenter is detected

***

### Audience Camera Connector

```javascript
const AUDIENCE_CAMERA_CONNECTOR_ID = 7;
```

Defines which video input connector is used for the audience or room overview camera.

This camera is used as the default view when monitoring starts and when no presenter is detected.

Example:

*   Audience overview camera connected to input 7
*   Macro switches back to ConnectorId `7` when the presenter is lost

The presenter and audience connector IDs are the most important values to verify before using the macro.

***

### Presenter Loss Delay

```javascript
const LOSS_DELAY_MS = 1500;
```

Controls how long the macro waits before switching back to the audience camera after the presenter is no longer detected.

The value is configured in milliseconds.

Example:

*   `1500` = wait 1.5 seconds before returning to the audience camera

This delay helps avoid unnecessary switching if the presenter briefly moves out of the tracking area, turns away, or is temporarily not detected.

***

### Minimum Switch Interval

```javascript
const MIN_SWITCH_INTERVAL_MS = 1500;
```

Controls the minimum time between camera source changes.

The value is configured in milliseconds.

Example:

*   `1500` = at least 1.5 seconds must pass before another camera switch is allowed

This prevents camera flapping, where the system rapidly switches back and forth between the audience and presenter cameras.

***

### Only Monitor In Call

```javascript
const ONLY_MONITOR_IN_CALL = true;
```

Controls whether automatic camera switching should only run during active calls.

*   `true` means monitoring starts when a call starts and stops when the call ends
*   `false` means monitoring starts immediately when the macro starts

The recommended setting is usually `true`, because automatic camera switching is normally only needed during video meetings. Set it to `false` if presenter detection and camera switching should also run when the device is not in a call.

***

### PresenterTrack Auto Recovery

```javascript
const AUTO_RECOVER_PRESENTERTRACK = true;
```

Controls whether the macro should try to re-enable PresenterTrack if PresenterTrack status becomes `Off` while monitoring is active.

*   `true` means the macro attempts to set PresenterTrack back to `Follow`
*   `false` means the macro does not try to recover PresenterTrack automatically

This is useful because the switching logic depends on PresenterTrack detection. If PresenterTrack stops, the macro may no longer receive reliable presenter detection updates.

***

## Practical Use Cases

### Training Rooms

The audience camera can show participants by default, while the presenter camera becomes active when an instructor moves into the presenter area.

### Classrooms

Remote students can see the room overview during interaction, and automatically get a focused teacher view when the teacher is presenting.

### Town Halls and Briefing Rooms

The room can stay on the audience or overview camera until a speaker enters the presentation area, creating a more professional experience without a camera operator.

### Boardrooms and Meeting Rooms

During normal discussion, the room overview remains active. If someone walks up to present at a screen, whiteboard, or lectern, the system switches to the presenter camera.

### Rooms Without Dedicated Technical Support

The room can handle camera logic automatically, so users do not need to understand camera routing, input selection, or PresenterTrack behavior.

***

## User Experience Benefit

For local users, the macro removes the need to think about camera control. They can simply start or join the meeting and use the room naturally.

For remote participants, the video view becomes more relevant. They see the room when the room is the focus, and the presenter when presentation activity begins.

The macro also avoids distracting behavior by using delayed fallback and rate limiting, so short detection changes do not cause constant camera switching.

***

## Operational Behavior

The macro treats the audience camera as the safe default view. This means the meeting starts with a stable room overview instead of immediately forcing the presenter camera.

The presenter camera is only selected when PresenterTrack confirms that a presenter is detected. If detection is lost, the macro waits before switching back to the audience camera.

It also avoids unnecessary commands by not repeatedly selecting the same camera source if it is already the desired source.

***

## Why PresenterTrack Is Used In The Background

PresenterTrack already provides presenter detection from the Cisco codec. This macro uses that detection in the background while keeping the audience camera as the active main source.

This allows the room to monitor for presenter activity without permanently showing the presenter camera. The presenter view is only used when there is a clear reason to use it.

***

## Why Monitoring Can Be Limited To Active Calls

Automatic camera switching is usually only needed during video meetings. When `ONLY_MONITOR_IN_CALL` is enabled, the macro starts monitoring when a call becomes active and stops when the call ends.

This keeps the room predictable when idle and prevents unnecessary camera switching outside meetings.

***

## Why The Delay And Rate Limiting Are Important

Presenter detection can briefly change if the presenter moves, turns away, or temporarily leaves the tracking area.

`LOSS_DELAY_MS` gives the presenter a short grace period before switching back to the audience camera. `MIN_SWITCH_INTERVAL_MS` prevents rapid repeated switching between camera sources.

Together, these controls make the camera behavior smoother and more suitable for real meeting room use.

***

## Why Auto Recovery Is Included

Automatic switching depends on PresenterTrack being active. If PresenterTrack status becomes `Off`, the macro can try to set it back to `Follow`.

This helps keep background presenter detection running and reduces the chance that automatic switching stops working during a meeting.

***

## Recommended Default Configuration

```javascript
const DEBUG = false;

const PRESENTER_CAMERA_CONNECTOR_ID = 8;
const AUDIENCE_CAMERA_CONNECTOR_ID = 7;

const LOSS_DELAY_MS = 1500;
const MIN_SWITCH_INTERVAL_MS = 1500;

const ONLY_MONITOR_IN_CALL = true;
const AUTO_RECOVER_PRESENTERTRACK = true;
```

***

## Summary

This macro automates camera switching between audience and presenter views in Cisco Room systems. It keeps the audience camera active by default, uses PresenterTrack in the background to detect presenter activity, switches to the presenter camera when needed, and returns to the audience camera after the presenter is lost.

The main value is a more natural and reliable hybrid meeting experience with less manual camera control, smoother switching, call-aware behavior, configurable timing, correct camera source selection, and optional PresenterTrack recovery.

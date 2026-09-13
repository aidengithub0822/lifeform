// lifeform streak widget — for the Scriptable app (free on the App Store).
//
// Setup:
// 1. Install "Scriptable" from the App Store.
// 2. Open it, tap + to create a new script, paste this whole file in, and
//    name it "lifeform".
// 3. Long-press your iPhone home screen → tap + → search "Scriptable" → add
//    a small widget.
// 4. Long-press the new widget → Edit Widget → set Script to "lifeform" →
//    paste your widget URL (from the flame in the app → "Home Screen widget"
//    → Copy) into the Parameter field.
//
// That's it — this widget re-fetches every time iOS refreshes it.

let url = args.widgetParameter;

async function getData() {
  const req = new Request(url.trim());
  const json = await req.loadJSON();
  // Surface a bad HTTP status even when the body still parses as JSON
  // (e.g. Vercel wrapping a 500 in JSON) instead of silently rendering
  // whatever partial data came back.
  if (req.response && req.response.statusCode >= 400 && !json.error) {
    throw new Error(`HTTP ${req.response.statusCode}`);
  }
  return json;
}

function color(hex) {
  return new Color(hex);
}

function errorWidget(widget, message) {
  const err = widget.addText(message);
  err.font = Font.systemFont(11);
  err.textColor = Color.red();
  return widget;
}

async function createWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#09090b");
  widget.setPadding(16, 16, 16, 16);

  if (!url || !url.trim()) {
    const warn = widget.addText("Set the widget URL in Edit Widget → Parameter");
    warn.font = Font.systemFont(12);
    warn.textColor = Color.orange();
    return widget;
  }

  let data;
  try {
    data = await getData();
  } catch (e) {
    // Include the real error (network failure, bad status, malformed JSON)
    // instead of a generic message — this is what you'd copy/paste back
    // when reporting the widget as broken.
    return errorWidget(widget, `lifeform: ${e && e.message ? e.message : "couldn't load data"}`);
  }

  if (data.error) {
    return errorWidget(widget, `lifeform: ${data.error}`);
  }

  try {
    const top = widget.addStack();
    top.centerAlignContent();
    const flame = top.addText("🔥");
    flame.font = Font.systemFont(28);
    top.addSpacer(6);
    const streakText = top.addText(`${data.currentStreak}`);
    streakText.font = Font.boldSystemFont(30);
    streakText.textColor = color(data.tierColor || "#a1a1aa");

    widget.addSpacer(4);
    const tierText = widget.addText(`${data.tierLabel || "Spark"} tier`);
    tierText.font = Font.mediumSystemFont(12);
    tierText.textColor = Color.gray();

    widget.addSpacer(10);
    const gymLine = widget.addText(
      `Gym: ${data.today?.gymCountThisWeek ?? 0}/${data.today?.gymTarget ?? "?"} this wk`
    );
    gymLine.font = Font.systemFont(12);
    gymLine.textColor = data.today?.onTrackToGrow ? color(data.tierColor || "#a1a1aa") : Color.gray();

    const foodLine = widget.addText(
      data.today?.loggedFoodToday ? "Food logged today" : "No food logged yet"
    );
    foodLine.font = Font.systemFont(11);
    foodLine.textColor = data.today?.loggedFoodToday ? Color.green() : Color.orange();
  } catch (e) {
    // A rendering bug (unexpected shape from the API) would otherwise leave
    // a totally blank widget with no clue why — show it instead.
    return errorWidget(widget, `lifeform render error: ${e && e.message ? e.message : String(e)}`);
  }

  return widget;
}

const widget = await createWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}
Script.complete();

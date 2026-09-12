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
  const req = new Request(url);
  return await req.loadJSON();
}

function color(hex) {
  return new Color(hex);
}

async function createWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#09090b");
  widget.setPadding(16, 16, 16, 16);

  if (!url) {
    const warn = widget.addText("Set the widget URL in Edit Widget → Parameter");
    warn.font = Font.systemFont(12);
    warn.textColor = Color.orange();
    return widget;
  }

  let data;
  try {
    data = await getData();
  } catch {
    const err = widget.addText("Couldn't load lifeform data");
    err.font = Font.systemFont(12);
    err.textColor = Color.red();
    return widget;
  }

  if (data.error) {
    const err = widget.addText(`lifeform: ${data.error}`);
    err.font = Font.systemFont(11);
    err.textColor = Color.red();
    return widget;
  }

  const top = widget.addStack();
  top.centerAlignContent();
  const flame = top.addText("🔥");
  flame.font = Font.systemFont(28);
  top.addSpacer(6);
  const streakText = top.addText(`${data.currentStreak}`);
  streakText.font = Font.boldSystemFont(30);
  streakText.textColor = color(data.tierColor);

  widget.addSpacer(4);
  const tierText = widget.addText(`${data.tierLabel} tier`);
  tierText.font = Font.mediumSystemFont(12);
  tierText.textColor = Color.gray();

  widget.addSpacer(10);
  const gymLine = widget.addText(`Gym: ${data.today.gymCountThisWeek}/${data.today.gymTarget} this wk`);
  gymLine.font = Font.systemFont(12);
  gymLine.textColor = data.today.onTrackToGrow ? color(data.tierColor) : Color.gray();

  const foodLine = widget.addText(
    data.today.loggedFoodToday ? "Food logged today" : "No food logged yet"
  );
  foodLine.font = Font.systemFont(11);
  foodLine.textColor = data.today.loggedFoodToday ? Color.green() : Color.orange();

  return widget;
}

const widget = await createWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}
Script.complete();

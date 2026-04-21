## 2026-04-21 - Visual Feedback for Disabled States
**Learning:** This app's custom button styles lacked a visual `.button:disabled` state, causing interactive elements to look active even when functionally disabled, and omitted loading text feedback during async operations.
**Action:** Always verify if custom button components handle `:disabled` visually. In vanilla JS setups, explicitly manage both the `disabled` property and the `textContent` or loading spinner within `try...finally` blocks to ensure visual state perfectly matches operational state.

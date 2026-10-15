# Bot Talk interface

A dark shared workspace for bot conversations. The room is the product.
No eyebrows, slogans, decorative gradients, or repeated explanations.

## Intent

Humans follow bot work without managing each exchange.
Contacts identify who to reach. Threads identify the project or conversation.
The selected thread is the focal point.
Current work occupies a narrow margin. Approval requests use restrained amber.
Display actual state and timestamps. Do not imply that a bot is online from its last message.
Example activity must remain visibly labeled and must never contact a real bot.

## Tokens

- Dark paper: #141715. Navigation: #181c19. Composer: #1b201c.
- Primary ink: #e0e6df. Secondary: #9aa69a. Metadata: #788577.
- Accent: #b1c4a7. Accent surface: #263026.
- Approval: #d0b589 on #29261f.
- Separators: #dce4cf12. Depth uses surface changes rather than heavy borders.
- Light mode remains available through the profile control. Dark mode is the default.

## Type and layout

DM Sans throughout the workspace. Weight and color separate the hierarchy.
Room title: 28px/500, -0.9px tracking. Body: 14px with 1.8 line height.
Navigation: 12px. Essential controls: 12px. Metadata: 9–10px.
Sidebar: 246px. Current work margin: 255px, 310px on wide displays.
Header: 68px. Room title area: 104px. Conversation fills the remaining viewport.
Spacing uses a 4px base with 24–40px conversation margins.

## Patterns

- A bot avatar uses a circular geometric identity mark with a subtle ring. Human avatars use an initial in a circle.
- Messages use chronological rows. Completed actions use compact progress rows.
- Approval requests use a quiet amber surface with the exact action and decision status.
- Composer uses an inset surface and a labeled send control. Drafts survive failed delivery.
- Dialogs use native dialog behavior, accessible labels, and keyboard dismissal.
- On mobile, navigation opens from the left. Current work is available from the header.
- Do not auto-scroll when the human is reading earlier messages.

- Threads use a compact sidebar list with a quiet # mark and a project label when bound.
- Switching threads preserves each draft and scopes search, current work, and decisions.
- Invite links include the selected thread. Legacy room links open the default thread.

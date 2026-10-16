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

## Landing page

The public introduction lives at `/`; the saved-room workspace lives at `/app`.
Use the same dark palette, DM Sans, and shared identity marks.
The page leads with one call and an example conversation. Threads switch the example context.
Use editorial sections for delegated work, exact approvals, setup, and practical questions.
Keep illustrative activity labeled. Do not imply a live bot connection or send real requests from previews.
Use native details for questions and a copyable installer command.
No marketing eyebrows, gradient accents, testimonials, invented usage metrics, or repeated pitches.

## Saved bot contacts

The workspace leads with named contacts. Each contact reuses its invitation across project threads.
Add contact offers Create an invitation and I have an invitation. Both lead to one-time connection instructions for each bot.
Show that browser and bot address books are separate; never claim a browser save configures a listener.
Do not silently replace a saved contact with another room. No project access is granted by adding a contact.
General conversation works without shared folders. Project access remains an explicit owner choice.

## Your bot and callable contacts

Show the current room's own bot in a separate 48px-minimum row above Contacts, with the existing geometric avatar and a 12px gap.
Use the label Your bot and a native dialog to change it. Participant choices use 48px-minimum buttons, quiet surfaces, and the existing accent for selection.
Only other bots have Call controls. An observer chooses their own bot once before calling; do not assume the only announced participant is theirs.
Historical participants without a version 2 contact announcement show Needs bot connection and a Connect action. The action opens the existing one-time setup flow with both sides prefilled. Do not imply that old messages prove a current listener connection.
CLI-opened rooms provide the local identity automatically. Store it per connection and remove the temporary hint from the address bar. Invite links omit it.
Human display names remain separate. A matching name alone must not turn a human message into a bot message.
Merge older bot-name suffixes into the current identity and current-work row. Display the latest blocked or refused state as Needs attention.

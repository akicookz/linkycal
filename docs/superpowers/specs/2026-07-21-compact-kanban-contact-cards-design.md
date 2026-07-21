# Compact Kanban Contact Cards

## Goal

Reduce the vertical space used by contact cards in the Contacts Kanban view while preserving the information needed to scan and act on the pipeline.

## Scope

The primary change applies to contact cards in the Kanban view. It does not change the contacts table, pipeline columns, drag-and-drop behavior, or contact editing. It also corrects the alignment of the empty Next Action card on the contact detail page without changing its populated or editing states.

## Card layout

Each card uses a compact three-line hierarchy:

1. A 24px initial avatar followed by the contact name.
2. The contact email aligned with the name text, without a mail icon.
3. A compact metadata row containing the time in the current stage and, when present, the relative deadline for a dated Next Action.

The metadata row uses a small centered dot between stage age and deadline. When the contact has no dated Next Action, only the stage age is rendered. Phone numbers and non-stage tag chips are removed from Kanban cards to keep the card focused and dense.

## Deadline status

The card displays the Next Action deadline as relative text such as `Due in 2h`, `Due in 3d`, or `Overdue by 30m`.

- Overdue or due within one hour: destructive red.
- Due after one hour but within 24 hours: amber.
- Due after 24 hours: primary green.

Stage age remains muted. Dynamic time values use tabular numerals and continue to refresh from the existing minute clock.

## Data flow

The contact service already computes each contact's operational Next Action facts while decorating list results. The list response will expose that existing `nextAction` value, and the shared `ViewContact` and Contacts page types will carry it into `ContactsKanban`.

No new endpoint or database query is required.

## Interaction and responsive behavior

The complete card remains the drag target and navigation target. Existing hover, dragging, and column behavior remain unchanged. Text truncates within the available column width so the denser layout does not widen the board.

## Empty Next Action card

When no Next Action, editor, or error is present, the contact detail card renders as one compact header row. The title and Add button share the same vertical center, and the unused content gap is removed. Populated, editing, and error states retain their current spacing.

## Testing

Focused temporary component tests will verify that a dated Next Action appears with its relative deadline, that an undated or missing deadline does not add empty metadata, and that the empty Next Action card uses the compact centered header. The temporary tests will be removed after verification, following the project preference. Existing contact-service and build checks will confirm the response shape and TypeScript integration.

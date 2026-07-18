# Muted Focused Input Surfaces Design

## Goal

Give focused text inputs and textareas a subtle, theme-aware surface tint that visually relates them to choice cards without making typing controls look like selectable cards.

## Design

- Use the active form primary color at 3% opacity for the resting input surface.
- Increase the primary tint to 4.5% while focused, alongside the existing customizable focus ring.
- Apply the treatment through `FocusedFieldInput` so standalone forms, booking details, and attached booking forms remain consistent.
- Keep control dimensions, typography, radius, placeholder treatment, and ring-shadow behavior unchanged.
- Leave choice cards at their existing 3.5% resting tint so inputs remain visually distinct.

## Verification

- Add a render-contract assertion for both resting and focused tint classes.
- Run the focused form render tests, TypeScript checking, and the production build.

## Constraint

Keep all work uncommitted.

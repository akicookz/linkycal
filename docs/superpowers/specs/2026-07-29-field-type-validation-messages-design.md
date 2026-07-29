# Field-type validation messages

## Problem

Required form fields currently receive one generic message based on the form
surface. Standalone forms say “Please fill this in” and booking forms say
“This field is required,” regardless of whether the respondent needs to type,
select, check, rate, upload, or choose a date.

## Behavior

Required-field messages will be derived centrally from the field type and used
by focused forms, classic forms, grouped sections, and booking-attached forms.

| Field type | Required message |
| --- | --- |
| `radio`, `select` | Please select an option |
| `multi_select` | Please select at least one option |
| `checkbox` | Please check this box |
| `rating` | Please choose a rating |
| `file` | Please choose a file |
| `date` | Please select a date |
| `time` | Please select a time |
| `email` | Please enter your email |
| `phone` | Please enter a phone number |
| `url` | Please enter a URL |
| `number` | Please enter a number |
| `textarea` | Please enter a response |
| `text` and unknown input types | Please enter a response |

The existing non-empty email validation remains “Please enter a valid email.”
Optional empty fields remain valid.

## Implementation

`validateFormExperienceField` will own the required-message mapping. Its
callers will pass only the field and current value, so message behavior cannot
diverge by surface or rendering mode. Input components will continue rendering
the returned error without embedding their own validation copy.

## Testing

A table-driven unit test will cover every supported field-type category,
optional empty values, and invalid non-empty email values. The focused-form
integration test will assert that an empty radio question renders “Please
select an option,” protecting the exact regression observed in the browser.

After automated verification, the active focused form will be reloaded in the
browser and the empty radio question will be checked visually.

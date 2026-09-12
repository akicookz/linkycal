import {
  isFieldVisible,
  isStepVisible,
  type FormCondition,
  type FormConditionField,
} from "@/lib/form-conditions";
import {
  analyticsStageForPage,
  formNeedsFocusedExplode,
  pagesFromFocusedForm,
} from "@/lib/form-pages";

export interface FormExperienceField {
  id: string;
  stepId: string;
  sortOrder: number;
  type: string;
  label: string;
  description: string | null;
  placeholder: string | null;
  required: boolean;
  hidden?: boolean;
  settings: Record<string, unknown> | null;
  options: Array<{ label: string; value: string }> | null;
  visibility?: FormCondition | null;
  contactMapping?: "name" | "email" | null;
}

export interface FormExperienceStep {
  id: string;
  sortOrder: number;
  title: string | null;
  description: string | null;
  richDescription: string | null;
  settings?: unknown;
  visibility?: FormCondition | null;
  fields: FormExperienceField[];
}

export interface FormExperienceForm {
  id: string;
  name: string;
  type?: "multi_step" | "single";
  status?: string;
  settings?: unknown;
  steps: FormExperienceStep[];
}

export interface VisibleFormExperienceStep extends FormExperienceStep {
  fields: FormExperienceField[];
}

export interface FormExperienceModel {
  allSortedSteps: FormExperienceStep[];
  allFields: FormExperienceField[];
  fieldsById: Record<string, FormConditionField>;
  completionField: FormExperienceField | null;
  steps: VisibleFormExperienceStep[];
  hiddenValueFieldIds: string[];
  hasDisplayContent: boolean;
}

export interface FormExperienceCheckpoint {
  stepIndex: number;
  totalSteps: number;
  isFinal: boolean;
  fields: FormExperienceField[];
}

export interface FormExperienceAnalyticsStage {
  key: string;
  label: string;
  kind: "statement" | "question" | "group" | "step";
  order: number;
  fieldType?: string;
  required?: boolean;
}

export interface FormExperienceAnalyticsEvent {
  type: "viewed" | "completed" | "skipped" | "validation_failed";
  screen: FormExperienceAnalyticsStage;
}

export interface CreateFormExperienceCheckpointInput {
  surface: "standalone" | "booking";
  steps: VisibleFormExperienceStep[];
  hiddenFields?: FormExperienceField[];
  stepIndex: number;
  isFinal: boolean;
}

export interface BuildFormExperienceModelInput {
  form: FormExperienceForm;
  values: Record<string, string>;
  surface: "standalone" | "booking";
  excludedFieldIds?: ReadonlySet<string>;
  requiredFieldIds?: ReadonlySet<string>;
}

export function getSortedFormSteps(
  form: FormExperienceForm,
): FormExperienceStep[] {
  return [...form.steps].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getAllFormFields(
  form: FormExperienceForm,
): FormExperienceField[] {
  return getSortedFormSteps(form).flatMap((step) => step.fields);
}

export interface ContactMappedFieldIds {
  nameFieldId?: string;
  emailFieldId?: string;
}

export function getContactMappedFieldIds(
  form: FormExperienceForm,
): ContactMappedFieldIds {
  const result: ContactMappedFieldIds = {};
  for (const step of form.steps) {
    for (const field of step.fields) {
      if (field.contactMapping === "name" && !result.nameFieldId) {
        result.nameFieldId = field.id;
      }
      if (field.contactMapping === "email" && !result.emailFieldId) {
        result.emailFieldId = field.id;
      }
    }
  }
  return result;
}

export function formSupportsMergedDetails(form: FormExperienceForm): boolean {
  const mapped = getContactMappedFieldIds(form);
  if (!mapped.nameFieldId || !mapped.emailFieldId) return false;
  // A visibility-gated mapped field could be hidden mid-flow, leaving the
  // merged booking with no way to collect name/email — only merge when the
  // mapped fields are unconditionally visible.
  for (const step of form.steps) {
    for (const field of step.fields) {
      if (field.id !== mapped.nameFieldId && field.id !== mapped.emailFieldId) {
        continue;
      }
      if (field.visibility || step.visibility) return false;
    }
  }
  return true;
}

export function shouldCollectDetailsWithForm(
  settings: unknown,
  form: FormExperienceForm | null | undefined,
): boolean {
  if (!form) return false;
  if (typeof settings !== "object" || settings === null) return false;
  if ((settings as Record<string, unknown>).collectDetailsWithForm !== true) {
    return false;
  }
  return formSupportsMergedDetails(form);
}

export function getCompletionField(
  form: FormExperienceForm,
): FormExperienceField | null {
  return getAllFormFields(form).find((field) => field.type === "completion") ?? null;
}

export function createFormExperienceCheckpoint(
  input: CreateFormExperienceCheckpointInput,
): FormExperienceCheckpoint | null {
  const { surface, steps, hiddenFields = [], stepIndex, isFinal } = input;
  const current = steps[stepIndex];
  if (!current) {
    const supportsEmptyCheckpoint =
      steps.length === 0 &&
      (surface === "standalone" || (surface === "booking" && isFinal));
    if (!supportsEmptyCheckpoint) {
      return null;
    }
    return {
      stepIndex,
      totalSteps: 0,
      isFinal,
      fields: hiddenFields,
    };
  }
  return {
    stepIndex,
    totalSteps: steps.length,
    isFinal,
    fields: [...current.fields, ...hiddenFields],
  };
}

function boundedAnalyticsLabel(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return (normalized || fallback).slice(0, 160);
}

function analyticsLabelForPage(
  step: VisibleFormExperienceStep,
  index: number,
): string {
  const title = step.title?.trim() ?? "";
  if (title) return title;
  if (step.fields.length === 1) return step.fields[0].label;
  return `Step ${index + 1}`;
}

export function buildFormExperienceAnalyticsStages(input: {
  steps: VisibleFormExperienceStep[];
}): FormExperienceAnalyticsStage[] {
  return input.steps.map(function mapPage(step, index) {
    const stage = analyticsStageForPage({
      stepId: step.id,
      fields: step.fields,
    });
    return {
      key: stage.key,
      label: boundedAnalyticsLabel(
        analyticsLabelForPage(step, index),
        `Step ${index + 1}`,
      ),
      kind: stage.kind,
      order: index + 1,
      fieldType: stage.fieldType,
      required: step.fields.some(function isRequired(field) {
        return field.required;
      }),
    };
  });
}

function explodeFocusedPages(
  form: FormExperienceForm,
  sortedSteps: FormExperienceStep[],
): FormExperienceStep[] {
  if (!formNeedsFocusedExplode(form)) return sortedSteps;

  const fieldsById = new Map<string, FormExperienceField>();
  const stepsById = new Map<string, FormExperienceStep>();
  for (const step of sortedSteps) {
    stepsById.set(step.id, step);
    for (const field of step.fields) {
      fieldsById.set(field.id, field);
    }
  }

  const drafts = pagesFromFocusedForm(
    sortedSteps.map(function toDraftInput(step) {
      return {
        id: step.id,
        sortOrder: step.sortOrder,
        title: step.title,
        description: step.description,
        richDescription: step.richDescription,
        settings: step.settings,
        fields: step.fields.map(function toPageField(field) {
          return {
            id: field.id,
            type: field.type,
            sortOrder: field.sortOrder,
          };
        }),
      };
    }),
  );

  const pages = drafts.map(function toVirtualStep(draft, index) {
    const virtualId = `page-${draft.fieldIds.join("-")}`;
    const source = stepsById.get(draft.sourceStepId);
    return {
      id: virtualId,
      sortOrder: index,
      title: draft.title,
      description: draft.description,
      richDescription: draft.richDescription,
      settings: draft.settings,
      visibility: source?.visibility ?? null,
      fields: draft.fieldIds.flatMap(function attachField(fieldId) {
        const field = fieldsById.get(fieldId);
        if (!field) return [];
        return [{ ...field, stepId: virtualId }];
      }),
    };
  });

  const completions = sortedSteps.filter(function isCompletionOnly(step) {
    return (
      step.fields.length > 0 &&
      step.fields.every(function isCompletion(field) {
        return field.type === "completion";
      })
    );
  });

  return [
    ...pages,
    ...completions.map(function reindex(step, index) {
      return { ...step, sortOrder: pages.length + index };
    }),
  ];
}

export function buildFormExperienceModel(
  input: BuildFormExperienceModelInput,
): FormExperienceModel {
  const { form, values, surface } = input;
  const excludedFieldIds = input.excludedFieldIds ?? new Set<string>();
  const requiredFieldIds = input.requiredFieldIds ?? new Set<string>();
  const allSortedSteps = getSortedFormSteps(form);
  const allFields = allSortedSteps.flatMap((step) => step.fields);
  const completionField =
    allFields.find((currentField) => currentField.type === "completion") ?? null;
  const fieldsById: Record<string, FormConditionField> = {};
  for (const currentField of allFields) {
    fieldsById[currentField.id] = {
      id: currentField.id,
      type: currentField.type,
      options: currentField.options,
      visibility: currentField.visibility ?? null,
    };
  }
  const conditionInputs = { values, fieldsById };
  const pageSteps = explodeFocusedPages(form, allSortedSteps);

  const conditionallyVisibleSteps = pageSteps.filter((step) =>
    isStepVisible({ visibility: step.visibility ?? null }, conditionInputs),
  );
  const steps = conditionallyVisibleSteps
    .map<VisibleFormExperienceStep>((step) => ({
      ...step,
      fields: [...step.fields]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter(
          (currentField) =>
            currentField.type !== "completion" &&
            !currentField.hidden &&
            isFieldVisible(
              {
                id: currentField.id,
                type: currentField.type,
                options: currentField.options,
                visibility: currentField.visibility ?? null,
              },
              conditionInputs,
            ) &&
            !excludedFieldIds.has(currentField.id),
        )
        .map((currentField) =>
          requiredFieldIds.has(currentField.id) && !currentField.required
            ? { ...currentField, required: true }
            : currentField,
        ),
    }))
    .filter((step) => step.fields.length > 0);

  const visibleFieldIds = new Set(
    steps.flatMap(function fieldIdsOf(step) {
      return step.fields.map(function idOf(field) {
        return field.id;
      });
    }),
  );
  const hiddenValueFieldIds = allFields
    .filter(
      (currentField) =>
        currentField.type !== "completion" &&
        !currentField.hidden &&
        values[currentField.id] !== undefined &&
        !(surface === "booking" && excludedFieldIds.has(currentField.id)) &&
        !visibleFieldIds.has(currentField.id),
    )
    .map((currentField) => currentField.id);

  return {
    allSortedSteps,
    allFields,
    fieldsById,
    completionField,
    steps,
    hiddenValueFieldIds,
    hasDisplayContent: steps.some((step) => step.fields.length > 0),
  };
}

function getRequiredFieldMessage(type: string): string {
  switch (type) {
    case "radio":
    case "select":
      return "Please select an option";
    case "multi_select":
      return "Please select at least one option";
    case "checkbox":
      return "Please check this box";
    case "rating":
      return "Please choose a rating";
    case "file":
      return "Please choose a file";
    case "date":
      return "Please select a date";
    case "time":
      return "Please select a time";
    case "email":
      return "Please enter your email";
    case "phone":
      return "Please enter a phone number";
    case "url":
      return "Please enter a URL";
    case "number":
      return "Please enter a number";
    case "textarea":
    case "text":
    default:
      return "Please enter a response";
  }
}

export function validateFormExperienceField(
  field: FormExperienceField,
  value: string,
): string | null {
  if (field.required && !value.trim()) {
    return getRequiredFieldMessage(field.type);
  }
  if (
    field.type === "email" &&
    value.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    return "Please enter a valid email";
  }
  return null;
}

export interface FormTransitionLock {
  isLocked(): boolean;
  run(action: () => Promise<boolean>): Promise<boolean>;
}

export function createFormTransitionLock(): FormTransitionLock {
  let locked = false;
  return {
    isLocked() {
      return locked;
    },
    async run(action) {
      if (locked) return false;
      locked = true;
      try {
        return await action();
      } finally {
        locked = false;
      }
    },
  };
}

import {
  isFieldVisible,
  isStepVisible,
  type FormCondition,
  type FormConditionField,
} from "@/lib/form-conditions";
import { sectionShowsFieldsTogether } from "@/lib/form-sections";

export interface FormExperienceField {
  id: string;
  stepId: string;
  sortOrder: number;
  type: string;
  label: string;
  description: string | null;
  placeholder: string | null;
  required: boolean;
  validation: Record<string, unknown> | null;
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
  type: "multi_step" | "single";
  status?: string;
  steps: FormExperienceStep[];
}

export interface VisibleFormExperienceStep extends FormExperienceStep {
  fields: FormExperienceField[];
}

export type FormExperienceScreen = {
  key: string;
  stepId: string;
  stepIndex: number;
} & (
  | {
      kind: "statement";
      title: string | null;
      description: string | null;
      richDescription: string | null;
    }
  | { kind: "question"; field: FormExperienceField; questionNumber: number }
  | {
      kind: "group";
      fields: FormExperienceField[];
      firstQuestionNumber: number;
    }
);

export interface FormExperienceModel {
  allSortedSteps: FormExperienceStep[];
  allFields: FormExperienceField[];
  fieldsById: Record<string, FormConditionField>;
  completionField: FormExperienceField | null;
  steps: VisibleFormExperienceStep[];
  screens: FormExperienceScreen[];
  hiddenValueFieldIds: string[];
  hasDisplayContent: boolean;
}

export interface FormExperienceCheckpoint {
  stepIndex: number;
  totalSteps: number;
  isFinal: boolean;
  fields: FormExperienceField[];
}

export interface CreateFormExperienceCheckpointInput {
  formType: FormExperienceForm["type"];
  surface: "standalone" | "booking";
  steps: VisibleFormExperienceStep[];
  stepIndex: number;
  isFinal: boolean;
}

export interface BuildFormExperienceModelInput {
  form: FormExperienceForm;
  values: Record<string, string>;
  surface: "standalone" | "booking";
  excludedFieldIds?: ReadonlySet<string>;
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

export function shouldCollectDetailsWithForm(
  settings: unknown,
  form: FormExperienceForm | null | undefined,
): boolean {
  if (!form) return false;
  if (typeof settings !== "object" || settings === null) return false;
  if ((settings as Record<string, unknown>).collectDetailsWithForm !== true) {
    return false;
  }
  const mapped = getContactMappedFieldIds(form);
  return !!mapped.nameFieldId && !!mapped.emailFieldId;
}

export function getCompletionField(
  form: FormExperienceForm,
): FormExperienceField | null {
  return getAllFormFields(form).find((field) => field.type === "completion") ?? null;
}

export function createFormExperienceCheckpoint(
  input: CreateFormExperienceCheckpointInput,
): FormExperienceCheckpoint | null {
  const { formType, surface, steps, stepIndex, isFinal } = input;
  const current = steps[stepIndex];
  if (!current) {
    const supportsEmptyCheckpoint =
      steps.length === 0 &&
      ((surface === "booking" && isFinal) ||
        (surface === "standalone" && formType === "single"));
    if (!supportsEmptyCheckpoint) {
      return null;
    }
    return {
      stepIndex,
      totalSteps: 0,
      isFinal,
      fields: [],
    };
  }
  return {
    stepIndex,
    totalSteps: steps.length,
    isFinal,
    fields: current.fields,
  };
}

function hasMeaningfulIntro(step: FormExperienceStep): boolean {
  const title = step.title?.trim() ?? "";
  const isDefaultTitle = /^(step|section) \d+$/i.test(title);
  return !!(
    step.description?.trim() ||
    step.richDescription?.trim() ||
    (title && !isDefaultTitle)
  );
}

function buildFocusedScreens(
  steps: VisibleFormExperienceStep[],
): FormExperienceScreen[] {
  const screens: FormExperienceScreen[] = [];
  let questionNumber = 0;

  steps.forEach((step, stepIndex) => {
    if (hasMeaningfulIntro(step)) {
      screens.push({
        kind: "statement",
        key: `statement-${step.id}`,
        stepId: step.id,
        stepIndex,
        title: step.title,
        description: step.description,
        richDescription: step.richDescription,
      });
    }

    if (sectionShowsFieldsTogether(step.settings)) {
      if (step.fields.length > 0) {
        screens.push({
          kind: "group",
          key: `group-${step.id}`,
          stepId: step.id,
          stepIndex,
          fields: step.fields,
          firstQuestionNumber: questionNumber + 1,
        });
        questionNumber += step.fields.length;
      }
      return;
    }

    for (const currentField of step.fields) {
      questionNumber += 1;
      screens.push({
        kind: "question",
        key: `field-${currentField.id}`,
        stepId: step.id,
        stepIndex,
        field: currentField,
        questionNumber,
      });
    }
  });

  return screens;
}

export function buildFormExperienceModel(
  input: BuildFormExperienceModelInput,
): FormExperienceModel {
  const { form, values, surface } = input;
  const excludedFieldIds = input.excludedFieldIds ?? new Set<string>();
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
  const withoutCompletionSteps = allSortedSteps.filter(
    (step) =>
      !(
        step.fields.length > 0 &&
        step.fields.every((currentField) => currentField.type === "completion")
      ),
  );

  const conditionallyVisibleSteps = withoutCompletionSteps.filter((step) =>
    isStepVisible({ visibility: step.visibility ?? null }, conditionInputs),
  );
  const conditionallyVisibleStepIds = new Set(
    conditionallyVisibleSteps.map((step) => step.id),
  );
  const steps = conditionallyVisibleSteps
    .map<VisibleFormExperienceStep>((step) => ({
      ...step,
      fields: [...step.fields]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter(
          (currentField) =>
            currentField.type !== "completion" &&
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
        ),
    }))
    .filter((step) => step.fields.length > 0);

  const screens = form.type === "multi_step" ? buildFocusedScreens(steps) : [];
  const hiddenValueFieldIds = allFields
    .filter(
      (currentField) =>
        currentField.type !== "completion" &&
        values[currentField.id] !== undefined &&
        !(surface === "booking" && excludedFieldIds.has(currentField.id)) &&
        ((surface === "booking" &&
          !conditionallyVisibleStepIds.has(currentField.stepId)) ||
          !isFieldVisible(
            {
              id: currentField.id,
              type: currentField.type,
              options: currentField.options,
              visibility: currentField.visibility ?? null,
            },
            conditionInputs,
          )),
    )
    .map((currentField) => currentField.id);

  return {
    allSortedSteps,
    allFields,
    fieldsById,
    completionField,
    steps,
    screens,
    hiddenValueFieldIds,
    hasDisplayContent:
      form.type === "multi_step"
        ? screens.length > 0
        : steps.some((step) => step.fields.length > 0),
  };
}

export function validateFormExperienceField(
  field: FormExperienceField,
  value: string,
  requiredMessage: string,
): string | null {
  if (field.required && !value.trim()) return requiredMessage;
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

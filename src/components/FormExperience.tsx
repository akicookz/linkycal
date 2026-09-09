import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FocusedFieldInput,
  isChoiceFieldType,
  type FocusedFieldDensity,
} from "@/components/FocusedFieldInput";
import { FocusedStepProgress } from "@/components/FocusedStepProgress";
import { FormFieldRenderer } from "@/components/FormFieldRenderer";
import { Logo } from "@/components/Logo";
import { RichTextContent } from "@/components/RichTextContent";
import {
  buildFormExperienceModel,
  createFormExperienceCheckpoint,
  createFormTransitionLock,
  buildFormExperienceAnalyticsStages,
  getFocusedQuestionProgress,
  validateFormExperienceField,
  type FormExperienceAnalyticsEvent,
  type FormExperienceAnalyticsStage,
  type FormExperienceCheckpoint as FormExperienceCheckpointData,
  type FormExperienceField,
  type FormExperienceForm,
  type FormExperienceScreen,
} from "@/lib/form-experience";
import {
  experienceThemeStyle,
  type FormExperienceTheme,
} from "@/lib/experience-theme";
import {
  getSectionImage,
  sectionImageStyle,
  type SectionImage,
  type SectionImageLayout,
} from "@/lib/form-sections";
import { cn } from "@/lib/utils";
import {
  chromeMarkerProps,
  EMPTY_CHROME,
  isChromeHidden,
  type PublicChrome,
} from "../../shared/public-chrome";

export type { FormExperienceTheme };

export type FormExperienceCheckpoint = FormExperienceCheckpointData;

export interface FormExperienceProps {
  form: FormExperienceForm;
  surface: "standalone" | "booking";
  values: Record<string, string>;
  files?: Record<string, File | null>;
  excludedFieldIds?: ReadonlySet<string>;
  requiredFieldIds?: ReadonlySet<string>;
  submitting: boolean;
  error: string | null;
  theme?: FormExperienceTheme;
  chrome?: PublicChrome;
  head?: ReactNode;
  honeypot?: ReactNode;
  onValueChange: (fieldId: string, value: string) => void;
  onFileChange?: (fieldId: string, file: File | null) => void;
  onClearFields: (fieldIds: string[]) => void;
  onCheckpoint: (checkpoint: FormExperienceCheckpoint) => Promise<boolean>;
  onAnalyticsEvent?: (event: FormExperienceAnalyticsEvent) => void;
  onExitBack?: () => void;
}

interface FocusedQuestionHeadingProps {
  number: number;
  label: string;
  required: boolean;
  density: FocusedFieldDensity;
  level?: "h1" | "h2";
}

function FocusedQuestionHeading(props: FocusedQuestionHeadingProps) {
  const {
    number,
    label,
    required,
    density,
    level: Heading = "h1",
  } = props;

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span
        data-focused-question-number={number}
        className={cn(
          "shrink-0 pt-[0.42em] font-medium tabular-nums text-muted-foreground/80",
          density === "compact" ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm",
        )}
      >
        {number}.
      </span>
      <Heading
        className={cn(
          "min-w-0 font-medium leading-[1.28] tracking-[-0.015em] text-balance",
          density === "compact" ? "text-lg sm:text-xl" : "text-xl sm:text-2xl",
        )}
      >
        {label}
        {required && (
          <span className="ml-1 align-super text-[0.58em] font-semibold text-destructive/80">
            *
          </span>
        )}
      </Heading>
    </div>
  );
}

export function FormExperience(props: FormExperienceProps) {
  const {
    form,
    surface,
    values,
    files = {},
    excludedFieldIds,
    requiredFieldIds,
    submitting,
    error,
    theme,
    chrome = EMPTY_CHROME,
    head,
    honeypot,
    onValueChange,
    onFileChange,
    onClearFields,
    onCheckpoint,
    onAnalyticsEvent,
    onExitBack,
  } = props;
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [screenIndex, setScreenIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionLock = useRef(createFormTransitionLock());
  const model = useMemo(
    () =>
      buildFormExperienceModel({
        form,
        values,
        surface,
        excludedFieldIds,
        requiredFieldIds,
      }),
    [form, values, surface, excludedFieldIds, requiredFieldIds],
  );
  const { steps, screens } = model;
  const analyticsStages = useMemo(
    () =>
      buildFormExperienceAnalyticsStages({
        formType: form.type,
        steps,
        screens,
      }),
    [form.type, steps, screens],
  );
  const currentStep = steps[currentStepIndex];
  const currentFields = currentStep?.fields ?? [];
  const currentScreen = screens[screenIndex] ?? null;
  const isLastStep = currentStepIndex === steps.length - 1;
  const isLastScreen = screenIndex === screens.length - 1;
  const currentAnalyticsStage =
    form.type === "multi_step"
      ? analyticsStages[screenIndex] ?? null
      : analyticsStages[currentStepIndex] ?? null;
  const analyticsObserverRef = useRef(onAnalyticsEvent);
  analyticsObserverRef.current = onAnalyticsEvent;
  const previousAnalyticsStagesRef = useRef<FormExperienceAnalyticsStage[]>(
    analyticsStages,
  );

  function emitAnalyticsEvent(event: FormExperienceAnalyticsEvent): void {
    try {
      analyticsObserverRef.current?.(event);
    } catch {
      // Analytics cannot affect validation, persistence, or navigation.
    }
  }

  function setValue(fieldId: string, value: string) {
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[fieldId];
      return next;
    });
    onValueChange(fieldId, value);
  }

  function setFileValue(fieldId: string, file: File | null) {
    onFileChange?.(fieldId, file);
    setValue(fieldId, file?.name ?? "");
  }

  function validateFields(fieldsToValidate: FormExperienceField[]) {
    const errors: Record<string, string> = {};
    for (const field of fieldsToValidate) {
      const message = validateFormExperienceField(
        field,
        values[field.id] ?? "",
      );
      if (message) errors[field.id] = message;
    }
    return errors;
  }

  function validateScreen(screen: FormExperienceScreen) {
    if (screen.kind === "statement") return {};
    if (screen.kind === "question") return validateFields([screen.field]);
    return validateFields(screen.fields);
  }

  async function checkpoint(
    stepIndex: number,
    isFinal: boolean,
  ): Promise<boolean> {
    const currentCheckpoint = createFormExperienceCheckpoint({
      formType: form.type,
      surface,
      steps,
      hiddenFields: model.allFields.filter((field) => field.hidden),
      stepIndex,
      isFinal,
    });
    if (!currentCheckpoint) return false;
    return onCheckpoint(currentCheckpoint);
  }

  function clearAutoAdvance() {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
  }

  async function goNext(): Promise<boolean> {
    if (submitting) return false;
    clearAutoAdvance();
    if (surface === "booking" && steps.length === 0) {
      return submitEmptyBooking();
    }
    return transitionLock.current.run(async () => {
      const screen = screens[screenIndex];
      if (!screen) return false;

      const errors = validateScreen(screen);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        const analyticsStage = analyticsStages[screenIndex];
        if (analyticsStage) {
          emitAnalyticsEvent({
            type: "validation_failed",
            screen: analyticsStage,
          });
        }
        return false;
      }

      const next = screens[screenIndex + 1];
      const leavingStep = isLastScreen || next?.stepIndex !== screen.stepIndex;
      if (leavingStep) {
        const accepted = await checkpoint(screen.stepIndex, isLastScreen);
        if (!accepted) return false;
        const analyticsStage = analyticsStages[screenIndex];
        if (analyticsStage) {
          emitAnalyticsEvent({
            type: "completed",
            screen: analyticsStage,
          });
        }
        if (isLastScreen) return true;
      } else {
        const analyticsStage = analyticsStages[screenIndex];
        if (analyticsStage) {
          emitAnalyticsEvent({
            type: "completed",
            screen: analyticsStage,
          });
        }
      }

      setDirection("forward");
      setScreenIndex((previous) =>
        Math.min(previous + 1, screens.length - 1),
      );
      return true;
    });
  }

  async function submitEmptyBooking(): Promise<boolean> {
    if (submitting) return false;
    return transitionLock.current.run(() => checkpoint(0, true));
  }

  async function submitCurrentStep(): Promise<boolean> {
    if (submitting) return false;
    return transitionLock.current.run(async () => {
      const errors = validateFields(currentFields);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        const analyticsStage = analyticsStages[currentStepIndex];
        if (analyticsStage) {
          emitAnalyticsEvent({
            type: "validation_failed",
            screen: analyticsStage,
          });
        }
        return false;
      }
      const accepted = await checkpoint(currentStepIndex, isLastStep);
      const analyticsStage = analyticsStages[currentStepIndex];
      if (accepted && analyticsStage) {
        emitAnalyticsEvent({
          type: "completed",
          screen: analyticsStage,
        });
      }
      if (accepted && !isLastStep) {
        setCurrentStepIndex((previous) => previous + 1);
      }
      return accepted;
    });
  }

  function goPrev() {
    if (submitting || transitionLock.current.isLocked()) return;
    clearAutoAdvance();

    if (form.type === "multi_step") {
      if (screenIndex === 0) {
        if (surface === "booking") onExitBack?.();
        return;
      }
      setDirection("back");
      setScreenIndex((previous) => Math.max(previous - 1, 0));
      return;
    }

    if (currentStepIndex === 0) {
      if (surface === "booking") onExitBack?.();
      return;
    }
    setCurrentStepIndex((previous) => Math.max(previous - 1, 0));
  }

  useEffect(() => {
    if (steps.length === 0) return;
    if (currentStepIndex >= steps.length) {
      setCurrentStepIndex(steps.length - 1);
    }
  }, [steps.length, currentStepIndex]);

  useEffect(() => {
    if (screens.length === 0) return;
    if (screenIndex >= screens.length) {
      setScreenIndex(screens.length - 1);
    }
  }, [screens.length, screenIndex]);

  useEffect(() => {
    if (model.hiddenValueFieldIds.length === 0) return;
    onClearFields(model.hiddenValueFieldIds);
  }, [model.hiddenValueFieldIds, onClearFields]);

  useEffect(() => {
    if (!currentAnalyticsStage) return;
    emitAnalyticsEvent({
      type: "viewed",
      screen: currentAnalyticsStage,
    });
  }, [currentAnalyticsStage]);

  useEffect(() => {
    const currentKeys = new Set(
      analyticsStages.map(function stageKey(stage) {
        return stage.key;
      }),
    );
    for (const previous of previousAnalyticsStagesRef.current) {
      if (currentKeys.has(previous.key)) continue;
      emitAnalyticsEvent({
        type: "skipped",
        screen: previous,
      });
    }
    previousAnalyticsStagesRef.current = analyticsStages;
  }, [analyticsStages]);

  // Latest-closure refs so the global keyboard listener and auto-advance
  // timers never act on stale state.
  const goNextRef = useRef(goNext);
  const goPrevRef = useRef(goPrev);
  const currentScreenRef = useRef<FormExperienceScreen | null>(currentScreen);
  const setValueRef = useRef(setValue);
  const valuesRef = useRef(values);
  useEffect(() => {
    goNextRef.current = goNext;
    goPrevRef.current = goPrev;
    currentScreenRef.current = currentScreen;
    setValueRef.current = setValue;
    valuesRef.current = values;
  });

  function scheduleAutoAdvance() {
    clearAutoAdvance();
    autoAdvanceTimer.current = setTimeout(() => {
      autoAdvanceTimer.current = null;
      goNextRef.current();
    }, 350);
  }

  useEffect(() => () => clearAutoAdvance(), []);

  // ─── Focused keyboard shortcuts ──────────────────────────────────────────

  useEffect(() => {
    if (form.type !== "multi_step") return;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target?.isContentEditable ?? false);

      // Text inputs handle Enter themselves (FocusedFieldInput onCommit).
      if (event.key === "Enter" && !inTextInput) {
        event.preventDefault();
        goNextRef.current();
        return;
      }

      if (inTextInput) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        goNextRef.current();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        goPrevRef.current();
        return;
      }

      // Letter shortcuts for choice questions (A, B, C, ...)
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const screen = currentScreenRef.current;
      if (
        screen?.kind !== "question" ||
        !isChoiceFieldType(screen.field.type) ||
        screen.field.type === "checkbox" ||
        !/^[a-z]$/i.test(event.key)
      ) {
        return;
      }
      const optionIndex = event.key.toUpperCase().charCodeAt(0) - 65;
      const option = screen.field.options?.[optionIndex];
      if (!option) return;
      event.preventDefault();

      const field = screen.field;
      if (field.type === "multi_select") {
        const selected = (valuesRef.current[field.id] ?? "")
          .split(",")
          .filter(Boolean);
        const next = selected.includes(option.value)
          ? selected.filter((value) => value !== option.value)
          : [...selected, option.value];
        setValueRef.current(field.id, next.join(","));
        return;
      }
      setValueRef.current(field.id, option.value);
      scheduleAutoAdvance();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type]);

  if (surface === "booking" && !model.hasDisplayContent) {
    return renderEmptyBookingExperience();
  }
  if (form.type === "multi_step") {
    return renderFocusedExperience();
  }
  return renderClassicExperience();

  function renderEmptyBookingExperience() {
    return (
      <div>
        {head}
        {honeypot}
        <div className="flex items-center justify-between mt-6">
          <button
            type="button"
            onClick={goPrev}
            disabled={submitting}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <Button
            type="button"
            disabled={submitting}
            onClick={submitEmptyBooking}
            className="px-10"
          >
            {submitting ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarCheck className="h-4 w-4" />
            )}
            Confirm Booking
          </Button>
        </div>
        {error && (
          <p className="text-sm text-destructive flex items-center gap-1.5 mt-4">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}
      </div>
    );
  }

  function renderFocusedExperience() {
    const isCompact = surface === "booking";
    const focusedDensity: FocusedFieldDensity = isCompact
      ? "compact"
      : "comfortable";
    const questionProgress = getFocusedQuestionProgress(screens, screenIndex);
    const currentSectionImage =
      currentScreen && !isChromeHidden(chrome, "media")
        ? getSectionImage(
          steps.find((step) => step.id === currentScreen.stepId)?.settings,
        )
        : null;
    const animatedScreen = currentScreen ? (
      <div
        key={currentScreen.key}
        data-density={isCompact ? "compact" : "comfortable"}
        className="animate-focused-screen"
        style={
          {
            "--screen-from": direction === "forward" ? "48px" : "-48px",
          } as CSSProperties
        }
      >
        {currentScreen.kind === "statement" ? (
          <div className={isCompact ? "space-y-4" : "space-y-6"}>
            {!isChromeHidden(chrome, "intro") ? (
              <div {...chromeMarkerProps("intro")}>
                {currentScreen.title && (
                  <h1
                    className={cn(
                      isCompact
                        ? "text-xl sm:text-2xl"
                        : "text-2xl sm:text-3xl",
                      "font-medium leading-[1.2] tracking-[-0.02em] text-balance",
                    )}
                  >
                    {currentScreen.title}
                  </h1>
                )}
                <RichTextContent
                  value={currentScreen.richDescription}
                  fallbackPlainText={currentScreen.description}
                  className={cn(
                    isCompact
                      ? "text-sm sm:text-base text-muted-foreground text-pretty"
                      : "text-base sm:text-lg text-muted-foreground text-pretty",
                  )}
                />
              </div>
            ) : null}
            {surface === "standalone" && (
              <div className="flex items-center gap-3 pt-1">
                <Button
                  onClick={goNext}
                  disabled={submitting}
                  className="active:scale-[0.96]"
                >
                  {submitting ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Continue
                </Button>
                <span className="hidden sm:inline text-[11px] text-muted-foreground/80">
                  press <span className="font-semibold">Enter ↵</span>
                </span>
              </div>
            )}
          </div>
        ) : currentScreen.kind === "group" ? (
          <div className={isCompact ? "space-y-5" : "space-y-7"}>
            <div className={isCompact ? "space-y-6" : "space-y-8"}>
              {currentScreen.fields.map((field, index) => (
                <div key={field.id} className="space-y-3">
                  <FocusedQuestionHeading
                    number={currentScreen.firstQuestionNumber + index}
                    label={field.label}
                    required={field.required}
                    density={focusedDensity}
                    level="h2"
                  />
                  {field.description && (
                    <div
                      className={cn(
                        isCompact
                          ? "text-sm sm:text-base text-muted-foreground prose prose-sm max-w-none text-pretty"
                          : "text-base text-muted-foreground prose prose-sm max-w-none text-pretty",
                      )}
                      dangerouslySetInnerHTML={{ __html: field.description }}
                    />
                  )}
                  <FocusedFieldInput
                    key={field.id}
                    field={field}
                    value={values[field.id] ?? ""}
                    onChange={(value) => setValue(field.id, value)}
                    fileValue={files[field.id] ?? null}
                    onFileChange={(file) => setFileValue(field.id, file)}
                    onCommit={(trigger) => {
                      // No auto-advance on choice — other questions on
                      // this screen may still be unanswered.
                      if (trigger === "enter") goNext();
                    }}
                    autoFocus={index === 0}
                    error={fieldErrors[field.id]}
                    density={focusedDensity}
                  />
                </div>
              ))}
            </div>

            {surface === "standalone" && (
              <>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={goNext}
                    disabled={submitting}
                    className="active:scale-[0.96]"
                  >
                    {submitting ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {isLastScreen ? "Submit" : "OK"}
                  </Button>
                  <span className="hidden sm:inline text-[11px] text-muted-foreground/80">
                    press <span className="font-semibold">Enter ↵</span>
                  </span>
                </div>

                {error && (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {error}
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className={isCompact ? "space-y-5" : "space-y-7"}>
            <div className={isCompact ? "space-y-2" : "space-y-2.5"}>
              <FocusedQuestionHeading
                number={currentScreen.questionNumber}
                label={currentScreen.field.label}
                required={currentScreen.field.required}
                density={focusedDensity}
              />
              {currentScreen.field.description && (
                <div
                  className={cn(
                    isCompact
                      ? "text-sm sm:text-base text-muted-foreground prose prose-sm max-w-none text-pretty"
                      : "text-base text-muted-foreground prose prose-sm max-w-none text-pretty",
                  )}
                  dangerouslySetInnerHTML={{
                    __html: currentScreen.field.description,
                  }}
                />
              )}
            </div>

            <FocusedFieldInput
              key={currentScreen.field.id}
              field={currentScreen.field}
              value={values[currentScreen.field.id] ?? ""}
              onChange={(value) => setValue(currentScreen.field.id, value)}
              fileValue={files[currentScreen.field.id] ?? null}
              onFileChange={(file) =>
                setFileValue(currentScreen.field.id, file)
              }
              onCommit={(trigger) => {
                if (trigger === "choice") scheduleAutoAdvance();
                else goNext();
              }}
              autoFocus
              error={fieldErrors[currentScreen.field.id]}
              density={focusedDensity}
            />

            {surface === "standalone" && (
              <>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={goNext}
                    disabled={submitting}
                    className="active:scale-[0.96]"
                  >
                    {submitting ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {isLastScreen ? "Submit" : "OK"}
                  </Button>
                  <span className="hidden sm:inline text-[11px] text-muted-foreground/80">
                    press <span className="font-semibold">Enter ↵</span>
                  </span>
                </div>

                {error && (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {error}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    ) : (
      <p className="text-sm text-muted-foreground text-center">
        This form doesn&apos;t have any questions yet.
      </p>
    );

    if (surface === "standalone") {
      return (
        <FocusedFormExperienceShell
          theme={theme}
          chrome={chrome}
          progressCurrent={questionProgress.current}
          progressTotal={questionProgress.total}
          showNav
          canPrev={screenIndex > 0 && !submitting}
          canNext={!isLastScreen && !submitting}
          onPrev={goPrev}
          onNext={goNext}
          media={
            currentSectionImage ? (
              <SectionMedia image={currentSectionImage} />
            ) : undefined
          }
          mediaLayout={currentSectionImage?.layout}
        >
          {head}
          {honeypot}
          {animatedScreen}
        </FocusedFormExperienceShell>
      );
    }

    return (
      <>
        {head}
        {honeypot}
        <FocusedStepProgress
          current={questionProgress.current}
          total={questionProgress.total}
          surface="booking"
          className="mb-1"
        />
        <div className="py-4 sm:py-6">{animatedScreen}</div>
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={goPrev}
            disabled={submitting}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <Button
            type="button"
            disabled={submitting}
            onClick={goNext}
            className="px-6 active:scale-[0.96]"
          >
            {submitting ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : isLastScreen ? (
              <CalendarCheck className="h-4 w-4" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {isLastScreen ? "Confirm Booking" : "Next"}
          </Button>
        </div>
        {error && (
          <p className="text-sm text-destructive flex items-center gap-1.5 mt-4">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}
      </>
    );
  }

  function renderClassicExperience() {
    if (surface === "booking") {
      return (
        <div>
          {head}
          {honeypot}
          {!isChromeHidden(chrome, "intro") ? (
            <div {...chromeMarkerProps("intro")}>
              {currentStep?.title && (
                <h2 className="text-base font-semibold mb-1">{currentStep.title}</h2>
              )}
              <RichTextContent
                value={currentStep?.richDescription}
                fallbackPlainText={currentStep?.description}
                className="mb-5 text-[13px]"
              />
            </div>
          ) : null}

          <div className="space-y-4">
            {currentFields.map((field) => (
              <FormFieldRenderer
                key={field.id}
                field={field}
                value={values[field.id] ?? ""}
                onChange={(value) => setValue(field.id, value)}
                fileValue={files[field.id] ?? null}
                onFileChange={(file) => setFileValue(field.id, file)}
                error={fieldErrors[field.id]}
              />
            ))}

            {error && isLastStep && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <div className="flex items-center justify-between mt-6">
            <button
              type="button"
              onClick={goPrev}
              disabled={submitting}
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            {isLastStep ? (
              <Button
                type="button"
                disabled={submitting}
                onClick={submitCurrentStep}
                className="px-10"
              >
                {submitting ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarCheck className="h-4 w-4" />
                )}
                {submitting ? "Booking..." : "Confirm Booking"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={submitting}
                onClick={submitCurrentStep}
                className="px-10"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      );
    }

    const classicSectionImage = isChromeHidden(chrome, "media")
      ? null
      : getSectionImage(currentStep?.settings);

    return (
      <FormExperiencePageShell
        theme={theme}
        chrome={chrome}
        media={
          classicSectionImage ? (
            <SectionMedia image={classicSectionImage} />
          ) : undefined
        }
        mediaLayout={classicSectionImage?.layout}
      >
        {head}
        <div className="mb-7">
          <div className="flex flex-col-reverse gap-4 md:flex-row md:items-center md:justify-between md:gap-4">
            {!isChromeHidden(chrome, "title") ? (
              <h1
                className="min-w-0 text-lg font-semibold"
                {...chromeMarkerProps("title")}
              >
                {form.name}
              </h1>
            ) : null}
            <FocusedStepProgress
              current={currentStepIndex}
              total={steps.length}
              className="-mx-4 -mt-4 w-[calc(100%+2rem)] sm:-mx-8 sm:-mt-5 sm:w-[calc(100%+4rem)] md:mx-0 md:mt-0 md:w-[40%] md:max-w-[40%] md:shrink-0 lg:w-32 lg:max-w-32"
            />
          </div>
          {!isChromeHidden(chrome, "intro") ? (
            <div {...chromeMarkerProps("intro")}>
              {steps.length > 1 && currentStep?.title && (
                <p className="mt-1.5 text-sm text-muted-foreground">{currentStep.title}</p>
              )}
              <RichTextContent
                value={currentStep?.richDescription}
                fallbackPlainText={currentStep?.description}
                className="mt-1.5"
              />
            </div>
          ) : null}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitCurrentStep();
          }}
          className="space-y-5 sm:space-y-6"
        >
          {honeypot}

          {model.allFields
            .filter((field) => field.hidden)
            .map((field) => (
              <input
                key={field.id}
                type="hidden"
                name={field.id}
                value={values[field.id] ?? ""}
              />
            ))}

          {currentFields.map((field) => (
            <FormFieldRenderer
              key={field.id}
              field={field}
              value={values[field.id] ?? ""}
              onChange={(value) => setValue(field.id, value)}
              fileValue={files[field.id] ?? null}
              onFileChange={(file) => setFileValue(field.id, file)}
              error={fieldErrors[field.id]}
              textareaRows={3}
            />
          ))}

          {error && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-6">
            {currentStepIndex > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={goPrev}
                disabled={submitting}
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <Button
              type="submit"
              disabled={submitting}
              className="min-w-[100px]"
            >
              {submitting ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />{" "}
                  {isLastStep ? "Submitting..." : "Next"}
                </>
              ) : isLastStep ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Submit
                </>
              ) : (
                <>
                  Next <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </FormExperiencePageShell>
    );
  }
}

// ─── Focused Shell ───────────────────────────────────────────────────────────
//
// Full-bleed Typeform-style canvas: question dashes at the top left of the
// form pane, vertically centered question area, navigation chevrons + branding
// at the bottom. Embeds hug content height so the host iframe can shrink.

// Fills its (relative, overflow-hidden) container while honoring the stored
// focal point + zoom. Shared by the focused split and the classic card.
function SectionMedia({ image }: { image: SectionImage }) {
  return (
    <img
      src={image.url}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full select-none"
      style={sectionImageStyle(image)}
    />
  );
}

export interface FocusedFormExperienceShellProps {
  children: ReactNode;
  theme?: FormExperienceTheme;
  chrome?: PublicChrome;
  progressCurrent: number;
  progressTotal: number;
  showNav: boolean;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  media?: ReactNode;
  mediaLayout?: SectionImageLayout;
}

function FocusedFormPane(props: {
  children: ReactNode;
  progress: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex-1 flex items-center justify-center px-6 py-14 sm:px-10 min-w-0",
        props.className,
      )}
    >
      <div className="w-full max-w-3xl mx-auto">
        {props.progress}
        {props.children}
      </div>
    </div>
  );
}

export function FocusedFormExperienceShell(
  props: FocusedFormExperienceShellProps,
): ReactNode {
  const {
    children,
    theme,
    chrome = EMPTY_CHROME,
    progressCurrent,
    progressTotal,
    showNav,
    canPrev = false,
    canNext = false,
    onPrev,
    onNext,
    media,
    mediaLayout = "left",
  } = props;
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "1";
  const showBranding = !isChromeHidden(chrome, "branding");

  const stepProgress = (
    <FocusedStepProgress
      current={progressCurrent}
      total={progressTotal}
      className="mb-14"
    />
  );

  return (
    <div
      className={cn(
        "flex flex-col relative",
        !isEmbedded && "min-h-dvh bg-background",
      )}
      style={experienceThemeStyle(theme, isEmbedded ? "embed" : "page")}
    >
      {media && mediaLayout === "top" ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div
            className="relative w-full h-44 shrink-0 overflow-hidden sm:h-60"
            {...chromeMarkerProps("media")}
          >
            {media}
          </div>
          <FocusedFormPane className="py-12" progress={stepProgress}>
            {children}
          </FocusedFormPane>
        </div>
      ) : media ? (
        <div
          className={cn(
            "flex-1 flex min-h-0",
            mediaLayout === "right" && "flex-row-reverse",
          )}
        >
          <div
            className="relative hidden md:block md:w-[44%] shrink-0 overflow-hidden"
            {...chromeMarkerProps("media")}
          >
            {media}
          </div>
          <FocusedFormPane progress={stepProgress}>
            {children}
          </FocusedFormPane>
        </div>
      ) : (
        <FocusedFormPane progress={stepProgress}>{children}</FocusedFormPane>
      )}

      <div className="flex items-center justify-between px-5 pb-4 sm:px-8 sm:pb-5">
        {showBranding ? (
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            {...chromeMarkerProps("branding")}
          >
            Powered by <Logo size="xs" />
          </Link>
        ) : (
          <span />
        )}

        {showNav && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label="Previous question"
              className="flex h-9 w-9 items-center justify-center rounded-l-[10px] bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              aria-label="Next question"
              className="flex h-9 w-9 items-center justify-center rounded-r-[10px] bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page Shell ──────────────────────────────────────────────────────────────

export interface FormExperiencePageShellProps {
  children: ReactNode;
  theme?: FormExperienceTheme;
  chrome?: PublicChrome;
  media?: ReactNode;
  mediaLayout?: SectionImageLayout;
}

export function FormExperiencePageShell(
  props: FormExperiencePageShellProps,
): ReactNode {
  const {
    children,
    theme,
    chrome = EMPTY_CHROME,
    media,
    mediaLayout = "left",
  } = props;
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "1";
  const showBanner =
    !!theme?.bannerImage && !isChromeHidden(chrome, "banner") && !media;
  const showBranding = !isChromeHidden(chrome, "branding");
  const themeStyle = experienceThemeStyle(
    theme,
    isEmbedded ? "embed" : "page",
  );

  const card = media ? (
    <div className="w-full max-w-[60rem] mx-auto">
      <div
        className={cn(
          "overflow-hidden rounded-[var(--radius)]",
          !isEmbedded && "bg-card",
          mediaLayout !== "top" && "flex",
          mediaLayout === "right" && "flex-row-reverse",
        )}
      >
        {mediaLayout === "top" && (
          <div
            className="relative h-44 w-full shrink-0 overflow-hidden sm:h-60"
            {...chromeMarkerProps("media")}
          >
            {media}
          </div>
        )}
        {(mediaLayout === "left" || mediaLayout === "right") && (
          <div
            className="relative hidden shrink-0 overflow-hidden sm:block sm:w-[42%]"
            {...chromeMarkerProps("media")}
          >
            {media}
          </div>
        )}
        <div className="min-w-0 flex-1 px-6 pb-7 pt-4 sm:px-10 sm:pb-9 sm:pt-5">
          {children}
        </div>
      </div>
    </div>
  ) : (
    <div className="w-full max-w-[60rem] mx-auto">
      {showBanner && (
        <div
          className="w-full h-40 sm:h-48 rounded-t-[var(--radius)] bg-cover bg-center"
          style={{ backgroundImage: `url(${theme!.bannerImage})` }}
          {...chromeMarkerProps("banner")}
        />
      )}
      <div
        className={cn(
          "px-6 pb-7 pt-4 sm:px-10 sm:pb-9 sm:pt-5",
          !isEmbedded && "bg-card",
          showBanner ? "rounded-b-[var(--radius)]" : "rounded-[var(--radius)]",
        )}
      >
        {children}
      </div>
    </div>
  );

  const footer = showBranding ? (
    <footer className="py-4 text-center" {...chromeMarkerProps("branding")}>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Powered by <Logo size="xs" />
      </Link>
    </footer>
  ) : null;

  if (isEmbedded) {
    return (
      <div style={themeStyle}>
        {card}
        {footer}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      style={themeStyle}
    >
      <div className="flex-1 flex items-center justify-center px-5 py-10 sm:px-6 sm:py-14">
        {card}
      </div>
      {footer}
    </div>
  );
}

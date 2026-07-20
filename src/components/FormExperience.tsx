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
import { FormFieldRenderer } from "@/components/FormFieldRenderer";
import { Logo } from "@/components/Logo";
import { RichTextContent } from "@/components/RichTextContent";
import {
  buildFormExperienceModel,
  createFormExperienceCheckpoint,
  createFormTransitionLock,
  validateFormExperienceField,
  type FormExperienceCheckpoint as FormExperienceCheckpointData,
  type FormExperienceField,
  type FormExperienceForm,
  type FormExperienceScreen,
} from "@/lib/form-experience";
import {
  getSectionImage,
  sectionImageStyle,
  type SectionImage,
  type SectionImageLayout,
} from "@/lib/form-sections";
import { cn } from "@/lib/utils";

export interface FormExperienceTheme {
  primaryBg?: string;
  primaryText?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  fontFamily?: string;
  backgroundImage?: string;
  bannerImage?: string;
}

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
  canHideBranding?: boolean;
  head?: ReactNode;
  honeypot?: ReactNode;
  onValueChange: (fieldId: string, value: string) => void;
  onFileChange?: (fieldId: string, file: File | null) => void;
  onClearFields: (fieldIds: string[]) => void;
  onCheckpoint: (checkpoint: FormExperienceCheckpoint) => Promise<boolean>;
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
    canHideBranding,
    head,
    honeypot,
    onValueChange,
    onFileChange,
    onClearFields,
    onCheckpoint,
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
  const currentStep = steps[currentStepIndex];
  const currentFields = currentStep?.fields ?? [];
  const currentScreen = screens[screenIndex] ?? null;
  const isLastStep = currentStepIndex === steps.length - 1;
  const isLastScreen = screenIndex === screens.length - 1;
  const requiredMessage =
    surface === "standalone" ? "Please fill this in" : "This field is required";

  const primaryStyle: CSSProperties | undefined =
    theme?.primaryBg || theme?.borderRadius != null
      ? {
          ...(theme?.primaryBg
            ? {
                backgroundColor: theme.primaryBg,
                color: theme.primaryText || "#fff",
                borderColor: theme.primaryBg,
              }
            : {}),
          ...(theme?.borderRadius != null
            ? { borderRadius: `${theme.borderRadius}px` }
            : {}),
        }
      : undefined;
  const outlineStyle: CSSProperties | undefined =
    theme?.borderRadius != null
      ? { borderRadius: `${theme.borderRadius}px` }
      : undefined;

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
        requiredMessage,
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
        return false;
      }

      const next = screens[screenIndex + 1];
      const leavingStep = isLastScreen || next?.stepIndex !== screen.stepIndex;
      if (leavingStep) {
        const accepted = await checkpoint(screen.stepIndex, isLastScreen);
        if (!accepted || isLastScreen) return accepted;
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
        return false;
      }
      const accepted = await checkpoint(currentStepIndex, isLastStep);
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
            style={primaryStyle}
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
    const firstQuestionScreenIndex = screens.findIndex(
      (screen) => screen.kind !== "statement",
    );
    const progressStarted =
      firstQuestionScreenIndex >= 0 && screenIndex >= firstQuestionScreenIndex;
    const progressPct = progressStarted
      ? Math.round(
          ((screenIndex - firstQuestionScreenIndex + 1) /
            (screens.length - firstQuestionScreenIndex)) *
            100,
        )
      : 0;
    const currentSectionImage = currentScreen
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
            {surface === "standalone" && (
              <div className="flex items-center gap-3 pt-1">
                <Button
                  onClick={goNext}
                  disabled={submitting}
                  className="active:scale-[0.96]"
                  style={primaryStyle}
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
                    style={primaryStyle}
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
                    style={primaryStyle}
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
          canHideBranding={canHideBranding}
          progressPct={progressPct}
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
        {progressStarted && (
          <div
            data-focused-progress="booking"
            className="pointer-events-none absolute top-2 right-0 left-14 sm:left-16 z-0 h-1 overflow-hidden bg-primary/10"
          >
            <div
              className="h-full rounded-r-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
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
            style={primaryStyle}
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
          {currentStep?.title && (
            <h2 className="text-base font-semibold mb-1">{currentStep.title}</h2>
          )}
          <RichTextContent
            value={currentStep?.richDescription}
            fallbackPlainText={currentStep?.description}
            className="mb-5 text-[13px]"
          />

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
                themeColor={theme?.primaryBg}
                themeTextColor={theme?.primaryText}
                themeRadius={theme?.borderRadius}
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
                style={primaryStyle}
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
                style={primaryStyle}
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      );
    }

    const classicSectionImage = getSectionImage(currentStep?.settings);

    return (
      <FormExperiencePageShell
        theme={theme}
        canHideBranding={canHideBranding}
        media={
          classicSectionImage ? (
            <SectionMedia image={classicSectionImage} />
          ) : undefined
        }
        mediaLayout={classicSectionImage?.layout}
      >
        {head}
        <div className="space-y-1.5 mb-7">
          <h1 className="text-lg font-semibold">{form.name}</h1>
          {steps.length > 1 && currentStep?.title && (
            <p className="text-sm text-muted-foreground">{currentStep.title}</p>
          )}
          <RichTextContent
            value={currentStep?.richDescription}
            fallbackPlainText={currentStep?.description}
          />
        </div>

        {/* Step progress indicator */}
        {steps.length > 1 && (
          <div className="flex gap-1.5 mb-7">
            {steps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  index <= currentStepIndex ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitCurrentStep();
          }}
          className="space-y-5 sm:space-y-6"
        >
          {honeypot}

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
              themeColor={theme?.primaryBg}
              themeTextColor={theme?.primaryText}
              themeRadius={theme?.borderRadius}
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
                style={outlineStyle}
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <Button
              type="submit"
              disabled={submitting}
              className="min-w-[100px]"
              style={primaryStyle}
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
// Full-bleed Typeform-style canvas: thin progress bar pinned to the top,
// vertically centered question area, navigation chevrons + branding at the
// bottom. Inside an embed it keeps a stable min-height instead of filling
// the viewport so the host iframe doesn't jump between questions.

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
  canHideBranding?: boolean;
  progressPct: number;
  showNav: boolean;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  media?: ReactNode;
  mediaLayout?: SectionImageLayout;
}

export function FocusedFormExperienceShell(
  props: FocusedFormExperienceShellProps,
): ReactNode {
  const {
    children,
    theme,
    canHideBranding,
    progressPct,
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
  const hideBrandingRequested = searchParams.get("hide_branding") === "1";
  const showBranding = !(hideBrandingRequested && canHideBranding);

  const themeVars = theme?.primaryBg
    ? ({
        ["--primary" as string]: theme.primaryBg,
        ["--primary-foreground" as string]: theme.primaryText || "#ffffff",
        ["--ring" as string]: theme.primaryBg,
      } as CSSProperties)
    : undefined;

  const navButtonStyle: CSSProperties | undefined = theme?.primaryBg
    ? { backgroundColor: theme.primaryBg, color: theme.primaryText || "#fff" }
    : undefined;

  return (
    <div
      className={cn(
        "flex flex-col relative",
        isEmbedded ? "min-h-[560px]" : "min-h-dvh bg-background",
      )}
      style={{
        ...(themeVars ?? {}),
        backgroundColor: !isEmbedded
          ? theme?.backgroundColor || undefined
          : undefined,
        color: theme?.textColor || undefined,
        fontFamily: theme?.fontFamily
          ? `"${theme.fontFamily}", sans-serif`
          : undefined,
        ...(!isEmbedded && theme?.backgroundImage
          ? {
              backgroundImage: `url(${theme.backgroundImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }
          : {}),
      }}
    >
      {/* Progress bar */}
      {progressPct > 0 && (
        <div
          data-focused-progress="standalone"
          className="absolute top-0 left-0 right-0 h-1 bg-primary/10 z-10"
        >
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {media && mediaLayout === "top" ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="relative w-full h-44 shrink-0 overflow-hidden sm:h-60">
            {media}
          </div>
          <div className="flex-1 flex items-center justify-center px-6 py-12 sm:px-10">
            <div className="w-full max-w-3xl mx-auto">{children}</div>
          </div>
        </div>
      ) : media ? (
        <div
          className={cn(
            "flex-1 flex min-h-0",
            mediaLayout === "right" && "flex-row-reverse",
          )}
        >
          <div className="relative hidden md:block md:w-[44%] shrink-0 overflow-hidden">
            {media}
          </div>
          <div className="flex-1 flex items-center justify-center px-6 py-14 sm:px-10 min-w-0">
            <div className="w-full max-w-3xl mx-auto">{children}</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center px-6 py-14 sm:px-10">
          <div className="w-full max-w-3xl mx-auto">{children}</div>
        </div>
      )}

      <div className="flex items-center justify-between px-5 pb-4 sm:px-8 sm:pb-5">
        {showBranding ? (
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
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
              style={navButtonStyle}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              aria-label="Next question"
              className="flex h-9 w-9 items-center justify-center rounded-r-[10px] bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={navButtonStyle}
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
  canHideBranding?: boolean;
  media?: ReactNode;
  mediaLayout?: SectionImageLayout;
}

export function FormExperiencePageShell(
  props: FormExperiencePageShellProps,
): ReactNode {
  const {
    children,
    theme,
    canHideBranding,
    media,
    mediaLayout = "left",
  } = props;
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "1";
  const hideBanner = searchParams.get("hide_banner") === "1";
  // A section image takes over the card layout; suppress the theme banner so we
  // don't stack two images.
  const showBanner = !!theme?.bannerImage && !hideBanner && !media;
  const hideBrandingRequested = searchParams.get("hide_branding") === "1";
  const showBranding = !(hideBrandingRequested && canHideBranding);

  const themeVars = theme?.primaryBg
    ? ({
        ["--primary" as string]: theme.primaryBg,
        ["--primary-foreground" as string]: theme.primaryText || "#ffffff",
        ["--ring" as string]: theme.primaryBg,
      } as CSSProperties)
    : undefined;

  const radiusStyle =
    theme?.borderRadius != null
      ? { borderRadius: `${theme.borderRadius}px` }
      : undefined;

  const card = media ? (
    <div className="w-full max-w-[60rem] mx-auto" style={themeVars}>
      <div
        className={cn(
          "overflow-hidden rounded-[20px] bg-card",
          mediaLayout !== "top" && "flex",
          mediaLayout === "right" && "flex-row-reverse",
        )}
        style={radiusStyle}
      >
        {mediaLayout === "top" && (
          <div className="relative h-44 w-full shrink-0 overflow-hidden sm:h-60">
            {media}
          </div>
        )}
        {(mediaLayout === "left" || mediaLayout === "right") && (
          <div className="relative hidden shrink-0 overflow-hidden sm:block sm:w-[42%]">
            {media}
          </div>
        )}
        <div className="min-w-0 flex-1 px-6 py-7 sm:px-10 sm:py-9">
          {children}
        </div>
      </div>
    </div>
  ) : (
    <div className="w-full max-w-[60rem] mx-auto" style={themeVars}>
      {showBanner && (
        <div
          className="w-full h-40 sm:h-48 rounded-t-[20px] bg-cover bg-center"
          style={{ backgroundImage: `url(${theme!.bannerImage})` }}
        />
      )}
      <div
        className={cn(
          "bg-card px-6 py-7 sm:px-10 sm:py-9",
          showBanner ? "rounded-b-[20px]" : "rounded-[20px]",
        )}
        style={{
          borderRadius:
            theme?.borderRadius != null
              ? showBanner
                ? `0 0 ${theme.borderRadius}px ${theme.borderRadius}px`
                : `${theme.borderRadius}px`
              : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );

  const footer = showBranding ? (
    <footer className="py-4 text-center">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Powered by <Logo size="sm" />
      </Link>
    </footer>
  ) : null;

  if (isEmbedded) {
    return (
      <div
        style={{
          color: theme?.textColor || undefined,
          fontFamily: theme?.fontFamily
            ? `"${theme.fontFamily}", sans-serif`
            : undefined,
        }}
      >
        {card}
        {footer}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      style={{
        backgroundColor: theme?.backgroundColor || undefined,
        color: theme?.textColor || undefined,
        fontFamily: theme?.fontFamily
          ? `"${theme.fontFamily}", sans-serif`
          : undefined,
        ...(theme?.backgroundImage
          ? {
              backgroundImage: `url(${theme.backgroundImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }
          : {}),
      }}
    >
      <div className="flex-1 flex items-center justify-center px-5 py-10 sm:px-6 sm:py-14">
        {card}
      </div>
      {footer}
    </div>
  );
}

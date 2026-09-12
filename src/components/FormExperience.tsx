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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FocusedStepProgress } from "@/components/FocusedStepProgress";
import { FormFieldRenderer } from "@/components/FormFieldRenderer";
import { Logo } from "@/components/Logo";
import { RichTextContent } from "@/components/RichTextContent";
import {
  buildFormExperienceModel,
  createFormExperienceCheckpoint,
  createFormTransitionLock,
  buildFormExperienceAnalyticsStages,
  validateFormExperienceField,
  type FormExperienceAnalyticsEvent,
  type FormExperienceAnalyticsStage,
  type FormExperienceCheckpoint as FormExperienceCheckpointData,
  type FormExperienceField,
  type FormExperienceForm,
} from "@/lib/form-experience";
import {
  isDefaultPageTitle,
  parseFormTransition,
  parsePageLayout,
  type FormPageFieldBlock,
  type FormPageLayout,
  type FormTransition,
} from "@/lib/form-pages";
import {
  experienceThemeStyle,
  type FormExperienceTheme,
} from "@/lib/experience-theme";
import {
  getSectionImage,
  sectionImageStyle,
  type SectionImage,
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

function isChoiceFieldType(type: string): boolean {
  return (
    type === "select" ||
    type === "multi_select" ||
    type === "radio" ||
    type === "checkbox"
  );
}

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

function screenFromStyle(
  transition: FormTransition,
  direction: "forward" | "back",
): CSSProperties {
  const offset = direction === "forward" ? "48px" : "-48px";
  if (transition === "horizontal") {
    return {
      "--screen-from-x": offset,
      "--screen-from-y": "0px",
    } as CSSProperties;
  }
  return {
    "--screen-from-x": "0px",
    "--screen-from-y": offset,
  } as CSSProperties;
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
  const { steps } = model;
  const transition = parseFormTransition(form.settings);
  const analyticsStages = useMemo(
    () =>
      buildFormExperienceAnalyticsStages({
        steps,
      }),
    [steps],
  );
  const currentStep = steps[currentStepIndex];
  const currentFields = currentStep?.fields ?? [];
  const currentFieldIds = currentFields.map(function idOf(field) {
    return field.id;
  });
  const pageLayout = currentStep
    ? parsePageLayout(currentStep.settings, currentFieldIds)
    : null;
  const isLastStep =
    steps.length === 0 || currentStepIndex === steps.length - 1;
  const currentAnalyticsStage = analyticsStages[currentStepIndex] ?? null;
  const choiceField =
    currentFields.length === 1 && isChoiceFieldType(currentFields[0].type)
      ? currentFields[0]
      : null;
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

  async function checkpoint(
    stepIndex: number,
    isFinal: boolean,
  ): Promise<boolean> {
    const currentCheckpoint = createFormExperienceCheckpoint({
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
      const errors = validateFields(currentFields);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        if (currentAnalyticsStage) {
          emitAnalyticsEvent({
            type: "validation_failed",
            screen: currentAnalyticsStage,
          });
        }
        return false;
      }
      const accepted = await checkpoint(currentStepIndex, isLastStep);
      if (accepted && currentAnalyticsStage) {
        emitAnalyticsEvent({
          type: "completed",
          screen: currentAnalyticsStage,
        });
      }
      if (accepted && !isLastStep) {
        setDirection("forward");
        setCurrentStepIndex((previous) => previous + 1);
      }
      return accepted;
    });
  }

  async function submitEmptyBooking(): Promise<boolean> {
    if (submitting) return false;
    return transitionLock.current.run(() => checkpoint(0, true));
  }

  function goPrev() {
    if (submitting || transitionLock.current.isLocked()) return;
    clearAutoAdvance();
    if (currentStepIndex === 0) {
      if (surface === "booking") onExitBack?.();
      return;
    }
    setDirection("back");
    setCurrentStepIndex((previous) => Math.max(previous - 1, 0));
  }

  useEffect(() => {
    if (steps.length === 0) return;
    if (currentStepIndex >= steps.length) {
      setCurrentStepIndex(steps.length - 1);
    }
  }, [steps.length, currentStepIndex]);

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
  const choiceFieldRef = useRef(choiceField);
  const setValueRef = useRef(setValue);
  const valuesRef = useRef(values);
  useEffect(() => {
    goNextRef.current = goNext;
    goPrevRef.current = goPrev;
    choiceFieldRef.current = choiceField;
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target?.isContentEditable ?? false);

      if (event.key === "Enter" && !inTextInput) {
        event.preventDefault();
        goNextRef.current();
        return;
      }

      if (inTextInput) return;

      const nextKey = transition === "horizontal" ? "ArrowRight" : "ArrowDown";
      const prevKey = transition === "horizontal" ? "ArrowLeft" : "ArrowUp";
      if (event.key === nextKey) {
        event.preventDefault();
        goNextRef.current();
        return;
      }
      if (event.key === prevKey) {
        event.preventDefault();
        goPrevRef.current();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const field = choiceFieldRef.current;
      if (
        !field ||
        field.type === "checkbox" ||
        !/^[a-z]$/i.test(event.key)
      ) {
        return;
      }
      const optionIndex = event.key.toUpperCase().charCodeAt(0) - 65;
      const option = field.options?.[optionIndex];
      if (!option) return;
      event.preventDefault();

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
  }, [transition]);

  if (surface === "booking" && !model.hasDisplayContent) {
    return renderEmptyBookingExperience();
  }
  return renderPageExperience();

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

  function handleFieldChange(field: FormExperienceField, value: string) {
    setValue(field.id, value);
    if (
      choiceField &&
      choiceField.id === field.id &&
      field.type !== "checkbox" &&
      field.type !== "multi_select"
    ) {
      scheduleAutoAdvance();
    }
  }

  function renderPageChrome(): ReactNode {
    const title = currentStep?.title?.trim() ?? "";
    const showTitle =
      !isChromeHidden(chrome, "intro") &&
      !!title &&
      !isDefaultPageTitle(title);
    const showIntro =
      !isChromeHidden(chrome, "intro") &&
      !!(
        currentStep?.richDescription?.trim() || currentStep?.description?.trim()
      );
    const image = getSectionImage(currentStep?.settings);
    const showImage = !isChromeHidden(chrome, "media") && !!image;
    if (!showTitle && !showIntro && !showImage) return null;
    return (
      <div className="space-y-3">
        {showTitle ? (
          <p
            className="text-sm font-medium leading-snug"
            {...chromeMarkerProps("intro")}
          >
            {title}
          </p>
        ) : null}
        {showIntro ? (
          <div {...chromeMarkerProps("intro")}>
            <RichTextContent
              value={currentStep?.richDescription}
              fallbackPlainText={currentStep?.description}
              className={cn(
                surface === "booking"
                  ? "text-sm sm:text-base text-muted-foreground text-pretty"
                  : "text-base sm:text-lg text-muted-foreground text-pretty",
              )}
            />
          </div>
        ) : null}
        {showImage && image ? (
          <div
            className="relative aspect-[4/3] w-full overflow-hidden rounded-[16px]"
            {...chromeMarkerProps("media")}
          >
            <SectionMedia image={image} />
          </div>
        ) : null}
      </div>
    );
  }

  function renderPageField(block: FormPageFieldBlock): ReactNode {
    const field = currentFields.find(function match(item) {
      return item.id === block.fieldId;
    });
    if (!field) return null;
    return (
      <FormFieldRenderer
        key={field.id}
        field={field}
        value={values[field.id] ?? ""}
        onChange={(value) => handleFieldChange(field, value)}
        fileValue={files[field.id] ?? null}
        onFileChange={(file) => setFileValue(field.id, file)}
        error={fieldErrors[field.id]}
        textareaRows={3}
      />
    );
  }

  function renderPageColumns(layout: FormPageLayout): ReactNode {
    return (
      <>
        {renderPageChrome()}
        <div className="space-y-6">
          {layout.rows.map(function renderRow(row, rowIndex) {
            const left = row.left ? renderPageField(row.left) : null;
            const right = row.right ? renderPageField(row.right) : null;
            if (left && right) {
              return (
                <div
                  key={`row-${rowIndex}`}
                  className="grid gap-6 md:grid-cols-2"
                >
                  <div>{left}</div>
                  <div>{right}</div>
                </div>
              );
            }
            return <div key={`row-${rowIndex}`}>{left ?? right}</div>;
          })}
        </div>
      </>
    );
  }

  function renderPageExperience() {
    const isCompact = surface === "booking";
    const hiddenInputs = model.allFields
      .filter((field) => field.hidden)
      .map((field) => (
        <input
          key={field.id}
          type="hidden"
          name={field.id}
          value={values[field.id] ?? ""}
        />
      ));

    const standaloneActions = surface === "standalone" && (
      <div className="flex items-center gap-3 pt-1">
        <Button
          type="button"
          onClick={goNext}
          disabled={submitting}
          className="active:scale-[0.96]"
        >
          {submitting ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : isLastStep ? (
            <Check className="h-4 w-4" />
          ) : null}
          {isLastStep ? "Submit" : "Next"}
          {!submitting && !isLastStep && <ArrowRight className="h-4 w-4" />}
        </Button>
        <span className="hidden sm:inline text-[11px] text-muted-foreground/80">
          press <span className="font-semibold">Enter ↵</span>
        </span>
      </div>
    );

    const pageBody = currentStep && pageLayout ? (
      <div
        key={currentStep.id}
        data-density={isCompact ? "compact" : "comfortable"}
        className="animate-focused-screen"
        style={screenFromStyle(transition, direction)}
      >
        <div className={isCompact ? "space-y-5" : "space-y-7"}>
          {renderPageColumns(pageLayout)}
          {standaloneActions}
          {surface === "standalone" && error && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
        </div>
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
          progressCurrent={currentStepIndex}
          progressTotal={steps.length}
          showNav
          navAxis={transition}
          canPrev={currentStepIndex > 0 && !submitting}
          canNext={!submitting}
          onPrev={goPrev}
          onNext={goNext}
        >
          {head}
          {honeypot}
          {hiddenInputs}
          {pageBody}
        </FocusedFormExperienceShell>
      );
    }

    return (
      <>
        {head}
        {honeypot}
        {hiddenInputs}
        <FocusedStepProgress
          current={currentStepIndex}
          total={steps.length}
          surface="booking"
          className="mb-1"
        />
        <div className="py-4 sm:py-6">{pageBody}</div>
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
            ) : isLastStep ? (
              <CalendarCheck className="h-4 w-4" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {isLastStep ? "Confirm Booking" : "Next"}
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
}

// ─── Focused Shell ───────────────────────────────────────────────────────────
//
// Full-bleed Typeform-style canvas: question dashes at the top left of the
// form pane, vertically centered question area, navigation chevrons + branding
// at the bottom. Embeds hug content height so the host iframe can shrink.

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
  navAxis?: FormTransition;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
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
    navAxis = "vertical",
    canPrev = false,
    canNext = false,
    onPrev,
    onNext,
  } = props;
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "1";
  const showBranding = !isChromeHidden(chrome, "branding");
  const isVerticalNav = navAxis === "vertical";

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
      <FocusedFormPane progress={stepProgress}>{children}</FocusedFormPane>

      <div className="mt-auto flex shrink-0 items-end justify-between px-5 pb-4 sm:px-8 sm:pb-5">
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
          <div
            className={cn(
              "flex items-center gap-1",
              isVerticalNav && "flex-col",
            )}
          >
            <button
              type="button"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label="Previous question"
              className={cn(
                "flex h-9 w-9 items-center justify-center bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed",
                isVerticalNav ? "rounded-t-[10px]" : "rounded-l-[10px]",
              )}
            >
              {isVerticalNav ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              aria-label="Next question"
              className={cn(
                "flex h-9 w-9 items-center justify-center bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed",
                isVerticalNav ? "rounded-b-[10px]" : "rounded-r-[10px]",
              )}
            >
              {isVerticalNav ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
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
}

export function FormExperiencePageShell(
  props: FormExperiencePageShellProps,
): ReactNode {
  const { children, theme, chrome = EMPTY_CHROME } = props;
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "1";
  const showBanner =
    !!theme?.bannerImage && !isChromeHidden(chrome, "banner");
  const showBranding = !isChromeHidden(chrome, "branding");
  const themeStyle = experienceThemeStyle(
    theme,
    isEmbedded ? "embed" : "page",
  );

  const card = (
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
          "px-4 py-4",
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

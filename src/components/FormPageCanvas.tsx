import {
  useState,
  useEffect,
  useRef,
  type DragEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  AlertCircle,
  Check,
  EyeOff,
  GripVertical,
  ImageIcon,
  Loader,
  Type,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FormFieldRenderer } from "@/components/FormFieldRenderer";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/RichTextEditor";
import {
  paintPageLayout,
  persistPageFieldDrop,
  persistPageLayout,
} from "@/lib/form-canvas-layout";
import type { FormCondition } from "@/lib/form-conditions";
import {
  PAGE_EDGE_PREFIX,
  PAGE_ROW_GAP_PREFIX,
  PAGE_SLOT_PREFIX,
  pageBlockId,
  pageEdgeId,
  pageRowGapId,
  pageSlotId,
  parsePageBlockId,
  resolveFieldDrop,
} from "@/lib/form-page-dnd";
import {
  canvasFieldRows,
  isDefaultPageTitle,
  type FormPageBlock,
  type FormPageFieldBlock,
  type FormPageLayout,
  type FormPageRow,
} from "@/lib/form-pages";
import { firstImageFile } from "@/lib/project-image-upload";
import { getRenderableRichTextHtml, richTextToPlainText } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

export interface FormPageCanvasField {
  id: string;
  type: string;
  label: string;
  description: string | null;
  placeholder: string | null;
  required: boolean;
  hidden?: boolean;
  options: Array<{ label: string; value: string }> | null;
  settings?: Record<string, unknown> | null;
  visibility?: FormCondition | null;
}

export interface FormPageCanvasStep {
  id: string;
  title: string | null;
  description: string | null;
  richDescription: string | null;
  settings: unknown;
}

export type FormPageSaveStatus = "saving" | "saved" | "error" | null;

export interface FormPageCanvasProps {
  step: FormPageCanvasStep;
  fields: FormPageCanvasField[];
  selectedFieldId: string | null;
  questionNumberByFieldId: Record<string, number>;
  uploadUrl: string;
  previewValues: Record<string, string>;
  onPreviewValueChange: (fieldId: string, value: string) => void;
  saveStatus: Record<string, FormPageSaveStatus | undefined>;
  autoFocusSelectedLabel?: boolean;
  onSelectField: (fieldId: string) => void;
  onSelectStep: () => void;
  onSaveLayout: (layout: FormPageLayout) => void;
  onSaveTitle: (title: string | null) => void;
  onSaveRichText: (
    richDescription: string,
    plainDescription: string | null,
  ) => void;
  onSaveFieldLabel: (fieldId: string, label: string) => void;
  onSaveFieldDescription: (fieldId: string, html: string) => void;
  onUploadError?: (error: unknown) => boolean;
}

export function FormPageCanvas({
  step,
  fields,
  selectedFieldId,
  questionNumberByFieldId,
  uploadUrl,
  previewValues,
  onPreviewValueChange,
  saveStatus,
  autoFocusSelectedLabel = false,
  onSelectField,
  onSelectStep,
  onSaveLayout,
  onSaveTitle,
  onSaveRichText,
  onSaveFieldLabel,
  onSaveFieldDescription,
  onUploadError,
}: FormPageCanvasProps) {
  const descriptionEditorRef = useRef<RichTextEditorHandle>(null);
  const persistLayout = persistPageLayout(step.settings, fields);
  const layout = paintPageLayout(
    step.settings,
    fields,
    previewValues,
    selectedFieldId,
  );
  const rows = canvasFieldRows(layout);
  const [activeBlock, setActiveBlock] = useState<FormPageBlock | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    const block = parsePageBlockId(String(event.active.id));
    if (block) setActiveBlock(block);
  }

  function handleDragCancel() {
    setActiveBlock(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const block = parsePageBlockId(String(event.active.id));
    const overId = event.over ? String(event.over.id) : null;
    setActiveBlock(null);
    if (!block || block.kind !== "field" || !overId) return;
    const target = resolveFieldDrop(overId);
    if (!target) return;
    const next = persistPageFieldDrop({
      settings: step.settings,
      fields,
      values: previewValues,
      selectedFieldId,
      fieldId: block.fieldId,
      target,
    });
    if (sameLayout(persistLayout, next)) return;
    onSaveLayout(next);
  }

  const dragging = !!activeBlock;
  const activeFieldId =
    activeBlock?.kind === "field" ? activeBlock.fieldId : null;

  function handlePageImageDrop(event: DragEvent<HTMLDivElement>) {
    const image = firstImageFile(event.dataTransfer);
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    void descriptionEditorRef.current?.insertImageFile(image);
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div
      className="w-full max-w-4xl mx-auto space-y-4"
      onDragOver={function allowPageImageDrop(event) {
        if (firstImageFile(event.dataTransfer)) event.preventDefault();
      }}
      onDrop={handlePageImageDrop}
    >
      <PageChrome
        step={step}
        uploadUrl={uploadUrl}
        editorRef={descriptionEditorRef}
        saveStatus={saveStatus}
        onSelectStep={onSelectStep}
        onSaveTitle={onSaveTitle}
        onSaveRichText={onSaveRichText}
        onUploadError={onUploadError}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={pageCollisionDetectionFor(activeFieldId)}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-1">
          <RowGap index={0} active={dragging} />
          {rows.map(function renderRow(row, rowIndex) {
            return (
              <div key={rowKey(row, rowIndex)}>
                <FieldRow
                  row={row}
                  rowIndex={rowIndex}
                  dragging={dragging}
                  activeFieldId={activeFieldId}
                  fields={fields}
                  selectedFieldId={selectedFieldId}
                  questionNumberByFieldId={questionNumberByFieldId}
                  previewValues={previewValues}
                  onPreviewValueChange={onPreviewValueChange}
                  saveStatus={saveStatus}
                  autoFocusSelectedLabel={autoFocusSelectedLabel}
                  onSelectField={onSelectField}
                  onSaveFieldLabel={onSaveFieldLabel}
                  onSaveFieldDescription={onSaveFieldDescription}
                />
                <RowGap index={rowIndex + 1} active={dragging} />
              </div>
            );
          })}
        </div>
        <DragOverlay>
          {activeBlock ? <PageBlockOverlay block={activeBlock} fields={fields} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
    </TooltipProvider>
  );
}

function PageChrome({
  step,
  uploadUrl,
  editorRef,
  saveStatus,
  onSelectStep,
  onSaveTitle,
  onSaveRichText,
  onUploadError,
}: {
  step: FormPageCanvasStep;
  uploadUrl: string;
  editorRef: Ref<RichTextEditorHandle>;
  saveStatus: Record<string, FormPageSaveStatus | undefined>;
  onSelectStep: () => void;
  onSaveTitle: (title: string | null) => void;
  onSaveRichText: (
    richDescription: string,
    plainDescription: string | null,
  ) => void;
  onUploadError?: (error: unknown) => boolean;
}) {
  return (
    <div className="space-y-2" onClick={onSelectStep}>
      <InlineEditableLabel
        key={`page-title-${step.id}`}
        value={isDefaultPageTitle(step.title) ? "" : (step.title ?? "")}
        placeholder="Title"
        textClassName="text-sm font-medium leading-none"
        saveStatus={saveStatus[step.id] ?? null}
        allowEmpty
        onSave={function saveTitle(title) {
          onSaveTitle(title.trim() || null);
        }}
      />
      <RichTextEditor
        ref={editorRef}
        key={`page-rich-${step.id}`}
        value={getRenderableRichTextHtml(step.richDescription, step.description)}
        variant="compact"
        placeholder="Add a short intro, context, or instructions."
        uploadUrl={uploadUrl}
        onUploadError={onUploadError}
        onSave={function saveRich(richDescription) {
          const next = richDescription ?? "";
          const currentValue = getRenderableRichTextHtml(
            step.richDescription,
            step.description,
          );
          const plainDescription = richTextToPlainText(next) || null;
          if (
            next !== currentValue ||
            plainDescription !== (step.description ?? null)
          ) {
            onSaveRichText(next, plainDescription);
          }
        }}
      />
    </div>
  );
}

function FieldRow({
  row,
  rowIndex,
  dragging,
  activeFieldId,
  fields,
  selectedFieldId,
  questionNumberByFieldId,
  previewValues,
  onPreviewValueChange,
  saveStatus,
  autoFocusSelectedLabel,
  onSelectField,
  onSaveFieldLabel,
  onSaveFieldDescription,
}: {
  row: FormPageRow;
  rowIndex: number;
  dragging: boolean;
  activeFieldId: string | null;
  fields: FormPageCanvasField[];
  selectedFieldId: string | null;
  questionNumberByFieldId: Record<string, number>;
  previewValues: Record<string, string>;
  onPreviewValueChange: (fieldId: string, value: string) => void;
  saveStatus: Record<string, FormPageSaveStatus | undefined>;
  autoFocusSelectedLabel: boolean;
  onSelectField: (fieldId: string) => void;
  onSaveFieldLabel: (fieldId: string, label: string) => void;
  onSaveFieldDescription: (fieldId: string, html: string) => void;
}) {
  const hasLeft = !!row.left;
  const hasRight = !!row.right;

  function renderField(block: FormPageFieldBlock) {
    return (
      <FieldEdgeDrop
        fieldId={block.fieldId}
        dragging={dragging}
        activeFieldId={activeFieldId}
      >
        <PageField
          block={block}
          fields={fields}
          selectedFieldId={selectedFieldId}
          questionNumberByFieldId={questionNumberByFieldId}
          previewValues={previewValues}
          onPreviewValueChange={onPreviewValueChange}
          saveStatus={saveStatus}
          autoFocusSelectedLabel={autoFocusSelectedLabel}
          onSelectField={onSelectField}
          onSaveFieldLabel={onSaveFieldLabel}
          onSaveFieldDescription={onSaveFieldDescription}
        />
      </FieldEdgeDrop>
    );
  }

  return (
    <div
      className={cn(
        "relative",
        hasLeft && hasRight && "grid grid-cols-1 gap-4 md:grid-cols-2",
        !hasLeft && !hasRight && "min-h-12",
      )}
    >
      {row.left ? renderField(row.left) : null}
      {row.right ? renderField(row.right) : null}
      {!hasLeft && !hasRight && dragging ? (
        <>
          <FieldEdgeSlot rowIndex={rowIndex} side="left" />
          <FieldEdgeSlot rowIndex={rowIndex} side="right" />
        </>
      ) : null}
    </div>
  );
}

function FieldEdgeDrop({
  fieldId,
  dragging,
  activeFieldId,
  children,
}: {
  fieldId: string;
  dragging: boolean;
  activeFieldId: string | null;
  children: ReactNode;
}) {
  if (!dragging || fieldId === activeFieldId) return children;
  return (
    <div className="relative">
      {children}
      <FieldEdgeHalves fieldId={fieldId} />
    </div>
  );
}

function FieldEdgeHalves({ fieldId }: { fieldId: string }) {
  const left = useDroppable({ id: pageEdgeId(fieldId, "left") });
  const right = useDroppable({ id: pageEdgeId(fieldId, "right") });
  const hovered = left.isOver || right.isOver;
  return (
    <>
      <FieldEdgeHalf
        setNodeRef={left.setNodeRef}
        side="left"
        show={hovered}
        active={left.isOver}
      />
      <FieldEdgeHalf
        setNodeRef={right.setNodeRef}
        side="right"
        show={hovered}
        active={right.isOver}
      />
    </>
  );
}

function FieldEdgeHalf({
  setNodeRef,
  side,
  show,
  active,
}: {
  setNodeRef: (element: HTMLElement | null) => void;
  side: "left" | "right";
  show: boolean;
  active: boolean;
}) {
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute inset-y-0 z-10 w-1/2",
        side === "left" ? "left-0" : "right-0",
      )}
    >
      {show ? <FieldGhostLine side={side} active={active} /> : null}
    </div>
  );
}

function FieldGhostLine({
  side,
  active,
}: {
  side: "left" | "right";
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 w-0.5 rounded-full",
        side === "right" ? "right-0" : "left-0",
        active ? "bg-primary" : "bg-primary/35",
      )}
    />
  );
}

function FieldEdgeSlot({
  rowIndex,
  side,
}: {
  rowIndex: number;
  side: "left" | "right";
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: pageSlotId(rowIndex, side),
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute inset-y-0 z-10 w-8",
        side === "right" ? "right-0" : "left-0",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 w-0.5 rounded-full",
          side === "right" ? "right-0" : "left-0",
          isOver ? "bg-primary" : "bg-primary/35",
        )}
      />
    </div>
  );
}

function RowGap({ index, active }: { index: number; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: pageRowGapId(index),
    disabled: !active,
  });
  return (
    <div ref={setNodeRef} className="relative min-h-2">
      {active && isOver ? (
        <div className="pointer-events-none absolute inset-x-0 inset-y-0 flex items-center">
          <div className="h-0.5 w-full rounded-full bg-primary" />
        </div>
      ) : null}
    </div>
  );
}

function PageField({
  block,
  fields,
  selectedFieldId,
  questionNumberByFieldId,
  previewValues,
  onPreviewValueChange,
  saveStatus,
  autoFocusSelectedLabel,
  onSelectField,
  onSaveFieldLabel,
  onSaveFieldDescription,
}: {
  block: FormPageFieldBlock;
  fields: FormPageCanvasField[];
  selectedFieldId: string | null;
  questionNumberByFieldId: Record<string, number>;
  previewValues: Record<string, string>;
  onPreviewValueChange: (fieldId: string, value: string) => void;
  saveStatus: Record<string, FormPageSaveStatus | undefined>;
  autoFocusSelectedLabel: boolean;
  onSelectField: (fieldId: string) => void;
  onSaveFieldLabel: (fieldId: string, label: string) => void;
  onSaveFieldDescription: (fieldId: string, html: string) => void;
}) {
  const id = pageBlockId(block);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  const field =
    fields.find(function match(item) {
      return item.id === block.fieldId;
    }) ?? null;
  const isFieldSelected = !!field && field.id === selectedFieldId;
  if (!field) return null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/pageblock relative rounded-[12px] px-2 py-1.5",
        isDragging && "opacity-35",
      )}
    >
      <button
        type="button"
        className="absolute left-0 top-1.5 -ml-5 flex h-6 w-5 cursor-grab items-center justify-center text-muted-foreground/0 transition-colors group-hover/pageblock:text-muted-foreground/60 active:cursor-grabbing"
        aria-label="Drag block"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div
        className={cn(
          "block w-full space-y-1.5 text-left",
          !isFieldSelected && "cursor-pointer",
        )}
        onClick={function selectField() {
          if (!isFieldSelected) onSelectField(field.id);
        }}
      >
        <div className="flex items-start gap-1.5">
          <span className="text-sm font-medium leading-none shrink-0 text-muted-foreground">
            {questionNumberByFieldId[field.id] != null
              ? `${questionNumberByFieldId[field.id]}.`
              : ""}
          </span>
          <span className="inline-flex max-w-full items-start gap-0.5">
            <InlineEditableLabel
              key={`field-label-${field.id}`}
              value={field.label}
              autoFocus={isFieldSelected && autoFocusSelectedLabel}
              placeholder="Your question here..."
              textClassName="text-sm font-medium leading-none"
              saveStatus={saveStatus[field.id] ?? null}
              fitContent
              onSave={function saveLabel(label) {
                onSaveFieldLabel(field.id, label);
              }}
            />
            {field.required ? (
              <FieldTitleHint label="Required">
                <span className="text-sm font-medium leading-none text-destructive">
                  *
                </span>
              </FieldTitleHint>
            ) : null}
            {field.hidden ? (
              <FieldTitleHint label="Hidden">
                <EyeOff className="mt-px h-3.5 w-3.5 text-muted-foreground" />
              </FieldTitleHint>
            ) : null}
          </span>
        </div>
        <FieldDescriptionEditor
          field={field}
          onSave={onSaveFieldDescription}
        />
        <FormFieldRenderer
          key={`preview-${field.id}`}
          field={{
            id: field.id,
            type: field.type,
            label: field.label,
            description: field.description,
            placeholder: field.placeholder,
            required: field.required,
            options: field.options,
            settings: field.settings ?? null,
          }}
          value={previewValues[field.id] ?? ""}
          onChange={function changeValue(val) {
            onPreviewValueChange(field.id, val);
          }}
          textareaRows={3}
          chrome="control"
        />
      </div>
    </div>
  );
}

function FieldTitleHint({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0 items-center" tabIndex={0}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function FieldDescriptionEditor({
  field,
  onSave,
}: {
  field: FormPageCanvasField;
  onSave: (fieldId: string, html: string) => void;
}) {
  return (
    <RichTextEditor
      key={`field-desc-${field.id}`}
      value={field.description ?? ""}
      placeholder="Add a description (optional)"
      variant="compact"
      onSave={function saveDesc(html) {
        onSave(field.id, html ?? "");
      }}
    />
  );
}

function PageBlockOverlay({
  block,
  fields,
}: {
  block: FormPageBlock;
  fields: FormPageCanvasField[];
}) {
  const field =
    block.kind === "field"
      ? fields.find(function match(item) {
          return item.id === block.fieldId;
        })
      : null;
  const label =
    block.kind === "title"
      ? "Title"
      : block.kind === "richText"
        ? "Text"
        : block.kind === "image"
          ? "Image"
          : field?.label || "Question";
  const Icon = block.kind === "image" ? ImageIcon : Type;

  return (
    <div className="rounded-[12px] border bg-background px-3 py-2 shadow-lg">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
}

export function InlineEditableLabel({
  value,
  onSave,
  autoFocus = false,
  placeholder = "Untitled",
  saveStatus,
  textClassName,
  allowEmpty = false,
  fitContent = false,
}: {
  value: string;
  onSave: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  saveStatus?: FormPageSaveStatus;
  textClassName?: string;
  allowEmpty?: boolean;
  fitContent?: boolean;
}) {
  const [localValue, setLocalValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [localValue]);

  const sizerText = localValue || placeholder;

  return (
    <div
      className={cn(
        "relative min-w-0",
        fitContent ? "grid w-max max-w-full" : "flex-1",
      )}
    >
      {fitContent ? (
        <span
          className={cn(
            "invisible col-start-1 row-start-1 whitespace-pre-wrap break-words pb-0.5",
            textClassName ?? "text-sm font-medium leading-none",
          )}
          aria-hidden
        >
          {sizerText}
        </span>
      ) : null}
      <textarea
        ref={textareaRef}
        rows={1}
        cols={1}
        autoFocus={autoFocus}
        value={localValue}
        placeholder={placeholder}
        onChange={function onChange(e) {
          setLocalValue(e.target.value);
        }}
        onFocus={function onFocus() {
          isEditingRef.current = true;
        }}
        onBlur={function onBlur() {
          isEditingRef.current = false;
          const next = localValue.trim();
          if (next === value) return;
          if (next || allowEmpty) {
            onSave(next);
            return;
          }
          setLocalValue(value);
        }}
        onKeyDown={function onKeyDown(e) {
          if (e.key === "Escape") {
            setLocalValue(value);
            e.currentTarget.blur();
          }
        }}
        className={cn(
          "min-w-0 resize-none overflow-hidden bg-transparent text-sm font-medium leading-none text-foreground outline-none border-0 border-b border-dashed border-transparent pb-0.5 transition-colors hover:border-muted-foreground/30 focus:border-solid focus:border-primary",
          fitContent
            ? "col-start-1 row-start-1 w-full min-w-0 field-sizing-content"
            : "block w-full",
          textClassName,
        )}
      />
      {saveStatus ? (
        <div
          className={cn(
            "pointer-events-none absolute left-full top-0 ml-2 flex items-center gap-1 whitespace-nowrap text-[11px] leading-none",
            saveStatus === "saving" && "text-muted-foreground",
            saveStatus === "saved" && "text-emerald-600",
            saveStatus === "error" && "text-destructive",
          )}
          role="status"
          aria-live="polite"
        >
          {saveStatus === "saving" && (
            <>
              <Loader className="h-3 w-3 animate-spin" />
              <span>Saving...</span>
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <Check className="h-3 w-3" />
              <span>Saved</span>
            </>
          )}
          {saveStatus === "error" && (
            <>
              <AlertCircle className="h-3 w-3" />
              <span>Failed to save</span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function sameLayout(a: FormPageLayout, b: FormPageLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function rowKey(row: FormPageRow, rowIndex: number): string {
  return `${rowIndex}:${row.left?.fieldId ?? "-"}:${row.right?.fieldId ?? "-"}`;
}

function pageCollisionDetectionFor(
  activeFieldId: string | null,
): CollisionDetection {
  return function pageCollisionDetection(args) {
    const droppables = args.droppableContainers.filter(function isTarget(container) {
      const id = String(container.id);
      if (
        activeFieldId &&
        id.startsWith(`${PAGE_EDGE_PREFIX}${activeFieldId}:`)
      ) {
        return false;
      }
      return (
        id.startsWith(PAGE_EDGE_PREFIX) ||
        id.startsWith(PAGE_SLOT_PREFIX) ||
        id.startsWith(PAGE_ROW_GAP_PREFIX)
      );
    });
    const scopedArgs = { ...args, droppableContainers: droppables };
    const pointerHits = pointerWithin(scopedArgs);
    if (pointerHits.length > 0) {
      const tightHits = pointerHits.filter(function isTight(hit) {
        const hitId = String(hit.id);
        return (
          hitId.startsWith(PAGE_EDGE_PREFIX) || hitId.startsWith(PAGE_SLOT_PREFIX)
        );
      });
      return tightHits.length > 0 ? tightHits : pointerHits;
    }
    return closestCenter(scopedArgs);
  };
}

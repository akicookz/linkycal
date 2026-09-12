import { readEntitlementError } from "@/lib/entitlement-errors";

const MAX_BYTES = 5 * 1024 * 1024;

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function firstImageFile(transfer: DataTransfer | null): File | null {
  if (!transfer) return null;
  for (const file of Array.from(transfer.files)) {
    if (isImageFile(file)) return file;
  }
  return null;
}

export async function uploadProjectImage(
  uploadUrl: string,
  file: File,
): Promise<string> {
  if (!isImageFile(file)) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }

  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(uploadUrl, { method: "POST", body: formData });
  if (!res.ok) {
    const planLimitError = await readEntitlementError(res.clone());
    if (planLimitError) throw planLimitError;
    throw new Error("Upload failed");
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("Upload failed");
  return data.url;
}
